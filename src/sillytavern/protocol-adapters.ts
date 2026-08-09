import { normalizeApiBaseUrl } from './api-config'
import { getTavernProvider } from './provider-registry'
import type { TavernApiConfig, TavernApiProtocol, TavernRequest } from './types'

export interface BuiltProviderRequest {
  url: string
  init: RequestInit
}

function joinUrl(baseUrl: string, path: string): string {
  return `${normalizeApiBaseUrl(baseUrl)}${path}`
}

function systemAndMessages(request: TavernRequest) {
  const system = request.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
  const messages = request.messages.filter((message) => message.role !== 'system')
  return { system, messages }
}

function geminiContents(request: TavernRequest) {
  const { system, messages } = systemAndMessages(request)
  return {
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    contents: messages.map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
  }
}

function providerHeaders(config: TavernApiConfig, apiKey: string): Record<string, string> {
  const provider = getTavernProvider(config.provider)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (provider.auth === 'bearer') headers.Authorization = `Bearer ${apiKey}`
  if (provider.auth === 'api-key') headers['api-key'] = apiKey
  if (provider.auth === 'x-api-key') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  }
  if (provider.auth === 'google-api-key') headers['x-goog-api-key'] = apiKey
  if (config.provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://github.com/hajimiha/tavern'
    headers['X-Title'] = '雾灯谷纪事'
  }
  return headers
}

function resolveChatPath(config: TavernApiConfig, stream: boolean): string {
  const definition = getTavernProvider(config.provider)
  let path = definition.chatPath
    .replace('{model}', config.model.replace(/^models\//, ''))
    .replace('{accountId}', encodeURIComponent(config.providerOptions.accountId ?? ''))
    .replace('{projectId}', encodeURIComponent(config.providerOptions.projectId ?? ''))
    .replace('{location}', encodeURIComponent(config.providerOptions.location ?? ''))
  if (!stream && (definition.protocol === 'gemini' || definition.protocol === 'vertex-gemini')) {
    path = path.replace(':streamGenerateContent?alt=sse', ':generateContent')
  }
  return path
}

export function buildProviderRequest(
  config: TavernApiConfig,
  apiKey: string,
  request: TavernRequest,
  stream: boolean,
): BuiltProviderRequest {
  const provider = getTavernProvider(config.provider)
  const url = joinUrl(config.baseUrl, resolveChatPath(config, stream))
  const common = { model: config.model, temperature: config.temperature }
  const openAiSampling = {
    top_p: config.topP,
    frequency_penalty: config.frequencyPenalty,
    presence_penalty: config.presencePenalty,
  }
  let body: Record<string, unknown>

  if (provider.protocol === 'anthropic-messages') {
    const { system, messages } = systemAndMessages(request)
    body = { ...common, max_tokens: config.maxResponseLength, top_p: config.topP, stream, messages, ...(system ? { system } : {}) }
  } else if (provider.protocol === 'gemini' || provider.protocol === 'vertex-gemini') {
    body = {
      ...geminiContents(request),
      generationConfig: {
        temperature: config.temperature,
        maxOutputTokens: config.maxResponseLength,
        topP: config.topP,
        frequencyPenalty: config.frequencyPenalty,
        presencePenalty: config.presencePenalty,
      },
    }
  } else if (provider.protocol === 'cohere-v2') {
    body = {
      ...common,
      max_tokens: config.maxResponseLength,
      p: config.topP,
      frequency_penalty: config.frequencyPenalty,
      presence_penalty: config.presencePenalty,
      stream,
      messages: request.messages,
    }
  } else if (provider.protocol === 'cloudflare-workers-ai') {
    body = { messages: request.messages, temperature: config.temperature, top_p: config.topP, max_tokens: config.maxResponseLength, stream }
  } else {
    body = { ...common, ...openAiSampling, messages: request.messages, max_tokens: config.maxResponseLength, stream }
  }

  return {
    url,
    init: {
      method: 'POST',
      headers: providerHeaders(config, apiKey),
      body: JSON.stringify(body),
    },
  }
}

export function buildProviderModelsRequest(config: TavernApiConfig, apiKey: string): BuiltProviderRequest | null {
  const provider = getTavernProvider(config.provider)
  if (!provider.modelsPath) return null
  return {
    url: joinUrl(config.baseUrl, provider.modelsPath),
    init: { method: 'GET', headers: providerHeaders(config, apiKey) },
  }
}

export interface ProviderContent {
  content: string
  reasoning: string
}

const EMPTY_PROVIDER_CONTENT: ProviderContent = { content: '', reasoning: '' }

function appendText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function anthropicParts(parts: unknown): ProviderContent {
  if (!Array.isArray(parts)) return EMPTY_PROVIDER_CONTENT
  let content = ''
  let reasoning = ''
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const value = part as Record<string, unknown>
    if (value.type === 'thinking' || value.type === 'redacted_thinking') {
      reasoning += appendText(value.thinking) || appendText(value.text)
    } else if (value.type === 'text' || !value.type) {
      content += appendText(value.text)
    }
  }
  return { content, reasoning }
}

function geminiParts(parts: unknown): ProviderContent {
  if (!Array.isArray(parts)) return EMPTY_PROVIDER_CONTENT
  let content = ''
  let reasoning = ''
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue
    const value = part as Record<string, unknown>
    if (value.thought === true) reasoning += appendText(value.text)
    else content += appendText(value.text)
  }
  return { content, reasoning }
}

function textParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts.map((part) => part && typeof part === 'object' ? appendText((part as Record<string, unknown>).text) : '').join('')
}

export function extractProviderContent(protocol: TavernApiProtocol, payload: unknown): ProviderContent {
  if (!payload || typeof payload !== 'object') return EMPTY_PROVIDER_CONTENT
  const value = payload as Record<string, any>
  if (protocol === 'anthropic-messages') return anthropicParts(value.content)
  if (protocol === 'gemini' || protocol === 'vertex-gemini') {
    return (Array.isArray(value.candidates) ? value.candidates : []).reduce((result: ProviderContent, candidate: any) => {
      const next = geminiParts(candidate?.content?.parts)
      result.content += next.content
      result.reasoning += next.reasoning
      return result
    }, { content: '', reasoning: '' })
  }
  if (protocol === 'cohere-v2') return { content: textParts(value.message?.content), reasoning: '' }
  if (protocol === 'cloudflare-workers-ai') {
    if (typeof value.result?.response === 'string') return { content: value.result.response, reasoning: '' }
    if (typeof value.response === 'string') return { content: value.response, reasoning: '' }
  }
  const message = value.choices?.[0]?.message ?? value.choices?.[0]?.delta ?? {}
  return {
    content: appendText(message.content),
    reasoning: appendText(message.reasoning_content) || appendText(message.reasoning) || appendText(message.thinking),
  }
}

export function extractProviderSseContent(protocol: TavernApiProtocol, payload: unknown): ProviderContent {
  if (!payload || typeof payload !== 'object') return EMPTY_PROVIDER_CONTENT
  const value = payload as Record<string, any>
  if (protocol === 'anthropic-messages') {
    if (value.type !== 'content_block_delta') return EMPTY_PROVIDER_CONTENT
    if (value.delta?.type === 'thinking_delta') return { content: '', reasoning: appendText(value.delta.thinking) }
    if (value.delta?.type === 'text_delta') return { content: appendText(value.delta.text), reasoning: '' }
    return EMPTY_PROVIDER_CONTENT
  }
  if (protocol === 'cohere-v2') {
    return value.type === 'content-delta'
      ? { content: appendText(value.delta?.message?.content?.text), reasoning: '' }
      : EMPTY_PROVIDER_CONTENT
  }
  if (protocol === 'cloudflare-workers-ai') {
    if (typeof value.response === 'string') return { content: value.response, reasoning: '' }
    if (typeof value.result?.response === 'string') return { content: value.result.response, reasoning: '' }
  }
  return extractProviderContent(protocol, payload)
}

/** @deprecated 使用 extractProviderContent，以免丢失供应商推理字段。 */
export function extractProviderText(protocol: TavernApiProtocol, payload: unknown): string {
  return extractProviderContent(protocol, payload).content
}

/** @deprecated 使用 extractProviderSseContent，以免丢失供应商推理字段。 */
export function extractProviderSseDelta(protocol: TavernApiProtocol, payload: unknown): string {
  return extractProviderSseContent(protocol, payload).content
}

export function extractProviderModels(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const value = payload as Record<string, any>
  const source = Array.isArray(value.data) ? value.data : Array.isArray(value.models) ? value.models : []
  return source.map((model: any) => {
    const id = typeof model?.id === 'string' ? model.id : typeof model?.name === 'string' ? model.name : ''
    return id.replace(/^models\//, '').trim()
  }).filter(Boolean)
}
