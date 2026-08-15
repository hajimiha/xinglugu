import {
  fetchProvider,
  ImageProviderError,
  sleepWithSignal,
  validateImageResponse,
  type ImageProviderAdapter,
  type ImageProviderFetch,
} from './base'

type ComfyVariableMap = {
  positivePrompt: string
  negativePrompt: string
  width: number
  height: number
  seed: number
  steps: number
  cfgScale: number
  sampler: string
  scheduler: string
  model: string
  vae: string
}

const VARIABLE_KEYS: Record<string, keyof ComfyVariableMap> = {
  positive_prompt: 'positivePrompt', negative_prompt: 'negativePrompt', width: 'width', height: 'height',
  seed: 'seed', steps: 'steps', cfg_scale: 'cfgScale', sampler: 'sampler', scheduler: 'scheduler',
  model: 'model', vae: 'vae',
}

export function injectComfyWorkflow(workflowJson: string, values: ComfyVariableMap): Record<string, unknown> {
  if (!workflowJson.trim()) throw new ImageProviderError('请先导入 ComfyUI 的 API 工作流 JSON。', 'IMAGE_CONFIGURATION_ERROR')
  let parsed: unknown
  try { parsed = JSON.parse(workflowJson) } catch {
    throw new ImageProviderError('ComfyUI 工作流不是有效 JSON。', 'IMAGE_CONFIGURATION_ERROR')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ImageProviderError('ComfyUI 工作流必须是 API 格式的节点对象。', 'IMAGE_CONFIGURATION_ERROR')
  }
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const exact = value.match(/^\{\{([a-z_]+)}}$/i)?.[1]
      if (exact && VARIABLE_KEYS[exact]) return values[VARIABLE_KEYS[exact]]
      return value.replace(/\{\{([a-z_]+)}}/gi, (match, name: string) => {
        const key = VARIABLE_KEYS[name]
        return key ? String(values[key]) : match
      })
    }
    if (Array.isArray(value)) return value.map(replace)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, replace(entry)]))
    return value
  }
  return replace(parsed) as Record<string, unknown>
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

type ComfyOutput = { filename: string; subfolder?: string; type?: string }

function extractOutput(history: unknown, promptId: string, outputNodeId: string): ComfyOutput | undefined {
  const root = history && typeof history === 'object' ? history as Record<string, any> : {}
  const entry = root[promptId] ?? root
  const outputs = entry?.outputs && typeof entry.outputs === 'object' ? entry.outputs as Record<string, any> : {}
  const nodes = outputNodeId && outputs[outputNodeId] ? [outputs[outputNodeId]] : Object.values(outputs)
  for (const node of nodes) {
    const image = Array.isArray(node?.images) ? node.images[0] : undefined
    if (image?.filename) return image as ComfyOutput
  }
  return undefined
}

export function createComfyUIAdapter(
  fetchImpl: ImageProviderFetch = globalThis.fetch.bind(globalThis),
): ImageProviderAdapter {
  return {
    provider: 'comfyui',
    label: 'ComfyUI',
    async generate({ settings, positivePrompt, negativePrompt, signal, onProgress }) {
      const config = settings.comfyUI
      const workflow = injectComfyWorkflow(config.workflowJson, {
        positivePrompt, negativePrompt, width: config.width, height: config.height, seed: config.seed,
        steps: config.steps, cfgScale: config.cfgScale, sampler: config.sampler, scheduler: config.scheduler,
        model: config.model, vae: config.vae,
      })
      const response = await fetchProvider(fetchImpl, endpoint(config.baseUrl, '/prompt'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: crypto.randomUUID() }), signal,
      })
      const submission = await response.json() as { prompt_id?: string; error?: string }
      if (!submission.prompt_id) throw new ImageProviderError(submission.error || 'ComfyUI 没有返回任务编号。', 'IMAGE_INVALID_RESPONSE')
      const startedAt = Date.now()
      onProgress?.(0.12, '工作流已进入 ComfyUI 队列')
      while (Date.now() - startedAt <= config.timeoutMs) {
        const historyResponse = await fetchProvider(fetchImpl, endpoint(config.baseUrl, `/history/${encodeURIComponent(submission.prompt_id)}`), { signal })
        const history = await historyResponse.json()
        const output = extractOutput(history, submission.prompt_id, config.outputNodeId)
        if (output) {
          const query = new URLSearchParams({
            filename: output.filename,
            subfolder: output.subfolder ?? '',
            type: output.type ?? 'output',
          })
          const imageResponse = await fetchProvider(fetchImpl, endpoint(config.baseUrl, `/view?${query}`), { signal })
          const blob = await validateImageResponse(imageResponse)
          const mimeType = blob.type
          onProgress?.(1, '工作流执行完成')
          return { blob, mimeType, width: config.width, height: config.height, model: config.model, seed: config.seed }
        }
        onProgress?.(Math.min(0.92, 0.12 + (Date.now() - startedAt) / config.timeoutMs * 0.8), '等待 ComfyUI 输出')
        await sleepWithSignal(config.pollIntervalMs, signal)
      }
      throw new ImageProviderError('ComfyUI 工作流执行超时。', 'IMAGE_TIMEOUT')
    },
    async testConnection(settings, _credential, signal) {
      const response = await fetchProvider(fetchImpl, endpoint(settings.comfyUI.baseUrl, '/system_stats'), { signal })
      const payload = await response.json() as { system?: { comfyui_version?: string } }
      return { label: 'ComfyUI 已连接', details: payload.system?.comfyui_version ? [payload.system.comfyui_version] : [] }
    },
    async cancel(settings, signal) {
      await fetchProvider(fetchImpl, endpoint(settings.comfyUI.baseUrl, '/interrupt'), { method: 'POST', signal })
    },
  }
}
