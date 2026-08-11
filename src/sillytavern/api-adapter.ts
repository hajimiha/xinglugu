import { getTavernProvider } from './provider-registry'
import {
  buildProviderModelsRequest,
  buildProviderRequest,
  extractProviderModels,
  extractProviderContent,
  extractProviderSseContent,
} from './protocol-adapters'
import { parseSseEvents } from './sse-parser'
import type { TavernApiAdapter, TavernApiConfig, TavernApiProtocol, TavernPreparedRequest, TavernProviderRequestInspection, TavernRequest, TavernStreamEvent } from './types'

export type TavernApiErrorCode =
  | 'TAVERN_API_KEY_MISSING'
  | 'TAVERN_API_UNAUTHORIZED'
  | 'TAVERN_API_RATE_LIMITED'
  | 'TAVERN_API_HTTP_ERROR'
  | 'TAVERN_API_NETWORK_ERROR'
  | 'TAVERN_API_INVALID_RESPONSE'
  | 'TAVERN_API_CONTEXT_OVERFLOW'

export class TavernApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: TavernApiErrorCode,
    readonly status?: number,
    readonly diagnostics?: { promptTokens: number; promptBudget: number; reservedResponseTokens: number },
  ) {
    super(message)
    this.name = 'TavernApiRequestError'
  }
}

type TavernFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function estimateTokens(content: string): number {
  const estimate = Array.from(content).reduce((total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 0.25 : 1), 0)
  return Math.max(1, Math.ceil(estimate))
}

function validateRequestBudget(request: TavernRequest, contextLength: number, maxResponseLength: number): void {
  const promptBudget = Math.floor(contextLength) - Math.max(0, Math.floor(maxResponseLength))
  const promptTokens = request.messages.reduce((total, message) => total + estimateTokens(message.content), 0)
  if (promptBudget < 1 || promptTokens > promptBudget) {
    throw new TavernApiRequestError(
      '编译后的酒馆提示词超过上下文预算，请缩短提示词或提高上下文长度。',
      'TAVERN_API_CONTEXT_OVERFLOW',
      undefined,
      { promptTokens, promptBudget, reservedResponseTokens: Math.max(0, Math.floor(maxResponseLength)) },
    )
  }
}

export class TavernApiDisabledError extends Error {
  readonly code = 'TAVERN_API_DISABLED' as const

  constructor() {
    super('酒馆 API 接口已预留，但当前未接入任何模型。')
    this.name = 'TavernApiDisabledError'
  }
}

export function createDisabledTavernApi(): TavernApiAdapter {
  return {
    mode: 'disabled',
    label: '接口已预留 · 模型未接入',
    prepare: (request) => ({
      id: crypto.randomUUID(),
      request,
      status: 'preview',
      createdAt: Date.now(),
    }),
    inspect: (prepared) => ({ url: '', method: 'POST', headers: {}, body: { messages: prepared.request.messages } }),
    async *stream() {
      throw new TavernApiDisabledError()
    },
  }
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  return headers instanceof Headers
    ? Object.fromEntries(headers.entries())
    : Array.isArray(headers)
      ? Object.fromEntries(headers)
      : Object.fromEntries(Object.entries(headers ?? {}).map(([key, value]) => [key, String(value)]))
}

function redactHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const values = normalizeHeaders(headers)
  const sensitive = /(?:auth|key|token|secret|credential|password|cookie)/i
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sensitive.test(key) ? '[已隐藏]' : value]))
}

function redactInspectionUrl(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '[已隐藏地址]'
  }
}

export function redactRequestInspection(inspection: TavernProviderRequestInspection): TavernProviderRequestInspection {
  return {
    ...inspection,
    url: redactInspectionUrl(inspection.url),
    headers: redactHeaders(inspection.headers),
  }
}

function inspectProviderRequest(config: TavernApiConfig, prepared: TavernPreparedRequest): TavernProviderRequestInspection {
  const built = buildProviderRequest(config, 'redacted', prepared.request, config.streaming)
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(String(built.init.body ?? '{}')) as Record<string, unknown> } catch { body = {} }
  return redactRequestInspection({
    url: built.url,
    method: built.init.method ?? 'POST',
    headers: normalizeHeaders(built.init.headers),
    body,
  })
}

function requireApiKey(apiKey: string): string {
  const key = apiKey.trim()
  if (!key) {
    throw new TavernApiRequestError(
      '尚未填写 API 密钥。请前往酒馆控制台的“接口”页完成配置。',
      'TAVERN_API_KEY_MISSING',
    )
  }
  return key
}

async function providerError(response: Response): Promise<TavernApiRequestError> {
  let detail = ''
  try {
    const payload = await response.json() as { error?: { message?: string }; message?: string }
    detail = payload.error?.message || payload.message || ''
  } catch {
    detail = ''
  }
  if (response.status === 401 || response.status === 403) {
    return new TavernApiRequestError(
      'API 鉴权失败，请检查密钥是否有效以及是否有权使用所选模型。',
      'TAVERN_API_UNAUTHORIZED',
      response.status,
    )
  }
  if (response.status === 429) {
    return new TavernApiRequestError(
      'API 请求过于频繁或额度不足，请稍后再试并检查服务商账户余额。',
      'TAVERN_API_RATE_LIMITED',
      response.status,
    )
  }
  return new TavernApiRequestError(
    `模型服务返回 ${response.status}${detail ? `：${detail}` : '，请检查接口地址和模型名称。'}`,
    'TAVERN_API_HTTP_ERROR',
    response.status,
  )
}

async function fetchProvider(fetchImpl: TavernFetch, input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchImpl(input, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new TavernApiRequestError(
      '无法连接模型服务。请检查网络、接口地址，以及该服务是否允许浏览器跨域访问。',
      'TAVERN_API_NETWORK_ERROR',
    )
  }
}

async function* streamSse(response: Response, protocol: TavernApiProtocol): AsyncGenerator<TavernStreamEvent> {
  if (!response.body) {
    throw new TavernApiRequestError('模型服务没有返回可读取的响应内容。', 'TAVERN_API_INVALID_RESPONSE')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let frameBuffer = ''
  let finished = false

  const consume = (frame: string): TavernStreamEvent[] => {
    const events: TavernStreamEvent[] = []
    for (const event of parseSseEvents([frame])) {
      const data = event.data.trim()
      if (!data) continue
      if (data === '[DONE]') {
        finished = true
        continue
      }
      try {
        const extracted = extractProviderSseContent(protocol, JSON.parse(data))
        if (extracted.reasoning) events.push({ type: 'reasoning-delta', text: extracted.reasoning })
        if (extracted.content) events.push({ type: 'content-delta', text: extracted.content })
      } catch {
        throw new TavernApiRequestError('模型服务返回了无法解析的流式数据。', 'TAVERN_API_INVALID_RESPONSE')
      }
    }
    return events
  }

  while (!finished) {
    const { done, value } = await reader.read()
    frameBuffer += decoder.decode(value, { stream: !done })
    let boundary = frameBuffer.search(/\r\n\r\n|\n\n|\r\r/)
    while (boundary >= 0 && !finished) {
      const separator = frameBuffer.slice(boundary).startsWith('\r\n\r\n') ? 4 : 2
      const frame = frameBuffer.slice(0, boundary)
      frameBuffer = frameBuffer.slice(boundary + separator)
      for (const event of consume(`${frame}\n\n`)) yield event
      boundary = frameBuffer.search(/\r\n\r\n|\n\n|\r\r/)
    }
    if (done) {
      for (const event of consume(frameBuffer)) yield event
      frameBuffer = ''
      finished = true
    }
  }
  yield { type: 'done' }
}

async function* streamResponse(response: Response, protocol: TavernApiProtocol): AsyncGenerator<TavernStreamEvent> {
  if (response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) {
    yield* streamSse(response, protocol)
    return
  }
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new TavernApiRequestError('模型服务返回的内容不是有效 JSON。', 'TAVERN_API_INVALID_RESPONSE')
  }
  const extracted = extractProviderContent(protocol, payload)
  if (!extracted.content && !extracted.reasoning) throw new TavernApiRequestError('模型响应中没有可识别的正文或推理字段。', 'TAVERN_API_INVALID_RESPONSE')
  if (extracted.reasoning) yield { type: 'reasoning-delta', text: extracted.reasoning }
  if (extracted.content) yield { type: 'content-delta', text: extracted.content }
  yield { type: 'done' }
}

export function createRemoteTavernApi(
  config: TavernApiConfig,
  apiKey: string,
  fetchImpl: TavernFetch = globalThis.fetch.bind(globalThis),
): TavernApiAdapter {
  const provider = getTavernProvider(config.provider)
  return {
    mode: 'remote',
    label: `${provider.label} · ${config.model}`,
    getPromptBudget: () => ({ contextLength: config.contextLength, maxResponseLength: config.maxResponseLength }),
    prepare: (request) => {
      validateRequestBudget(request, config.contextLength, config.maxResponseLength)
      return {
        id: crypto.randomUUID(),
        request,
        status: 'preview',
        createdAt: Date.now(),
      }
    },
    inspect: (prepared) => inspectProviderRequest(config, prepared),
    async *stream(prepared: TavernPreparedRequest, signal?: AbortSignal) {
      const key = requireApiKey(apiKey)
      const built = buildProviderRequest(config, key, prepared.request, config.streaming)
      const response = await fetchProvider(fetchImpl, built.url, { ...built.init, signal })
      if (!response.ok) throw await providerError(response)
      yield* streamResponse(response, provider.protocol)
    },
  }
}

export async function testTavernApiConnection(
  config: TavernApiConfig,
  apiKey: string,
  fetchImpl: TavernFetch = globalThis.fetch.bind(globalThis),
): Promise<{ models: string[] }> {
  const key = requireApiKey(apiKey)
  const modelsRequest = buildProviderModelsRequest(config, key)
  if (!modelsRequest) {
    const check = buildProviderRequest(config, key, { task: 'story', messages: [{ role: 'user', content: '请只回复“连接成功”。' }] }, false)
    const response = await fetchProvider(fetchImpl, check.url, check.init)
    if (!response.ok) throw await providerError(response)
    let payload: unknown
    try { payload = await response.json() } catch { throw new TavernApiRequestError('连接成功，但响应格式无法识别。', 'TAVERN_API_INVALID_RESPONSE') }
    const extracted = extractProviderContent(getTavernProvider(config.provider).protocol, payload)
    if (!extracted.content && !extracted.reasoning) {
      throw new TavernApiRequestError('连接成功，但模型没有返回可识别的正文。', 'TAVERN_API_INVALID_RESPONSE')
    }
    return { models: [] }
  }
  const response = await fetchProvider(fetchImpl, modelsRequest.url, modelsRequest.init)
  if (!response.ok) throw await providerError(response)
  try {
    return { models: extractProviderModels(await response.json()) }
  } catch {
    throw new TavernApiRequestError('连接成功，但模型列表格式无法识别。', 'TAVERN_API_INVALID_RESPONSE')
  }
}
