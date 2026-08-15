import {
  decodeBase64Image,
  fetchProvider,
  ImageProviderError,
  validateImageResponse,
  validateRemoteImageUrl,
  type ImageProviderAdapter,
  type ImageProviderFetch,
} from './base'

export function createOpenAIImageAdapter(
  fetchImpl: ImageProviderFetch = globalThis.fetch.bind(globalThis),
): ImageProviderAdapter {
  return {
    provider: 'openai-image',
    label: 'OpenAI / Grok 兼容图像接口',
    async generate({ settings, positivePrompt, negativePrompt, credential, signal, onProgress }) {
      const config = settings.openAIImage
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (credential?.trim()) headers.authorization = `Bearer ${credential.trim()}`
      const prompt = negativePrompt ? `${positivePrompt}\n\nAvoid: ${negativePrompt}` : positivePrompt
      onProgress?.(0.1, '正在提交远程绘图请求')
      const response = await fetchProvider(fetchImpl, `${config.baseUrl.replace(/\/+$/, '')}/images/generations`, {
        method: 'POST', headers,
        body: JSON.stringify({
          model: config.model, prompt, n: 1, size: config.size, quality: config.quality,
          ...(config.style ? { style: config.style } : {}),
          response_format: config.responseFormat,
        }),
        signal,
      })
      let payload: { data?: Array<{ b64_json?: string; url?: string; revised_prompt?: string }> }
      try { payload = await response.json() } catch {
        throw new ImageProviderError('远程绘图服务返回的内容不是有效 JSON。', 'IMAGE_INVALID_RESPONSE')
      }
      const item = payload.data?.[0]
      if (!item) throw new ImageProviderError('远程绘图服务没有返回图片。', 'IMAGE_INVALID_RESPONSE')
      let blob: Blob
      if (item.b64_json) blob = decodeBase64Image(item.b64_json)
      else if (item.url) {
        const url = validateRemoteImageUrl(item.url)
        blob = await validateImageResponse(await fetchProvider(fetchImpl, url, { signal }))
      } else throw new ImageProviderError('远程绘图响应缺少 b64_json 或 url。', 'IMAGE_INVALID_RESPONSE')
      onProgress?.(1, '远程绘图完成')
      const size = config.size.match(/^(\d+)x(\d+)$/)
      return {
        blob, mimeType: blob.type || 'image/png',
        width: Number(size?.[1] ?? 0), height: Number(size?.[2] ?? 0),
        model: config.model, seed: -1, revisedPrompt: item.revised_prompt,
      }
    },
    async testConnection(settings, credential, signal) {
      const headers: Record<string, string> = {}
      if (credential?.trim()) headers.authorization = `Bearer ${credential.trim()}`
      const response = await fetchProvider(fetchImpl, `${settings.openAIImage.baseUrl.replace(/\/+$/, '')}/models`, { headers, signal })
      const payload = await response.json() as { data?: Array<{ id?: string }> }
      return { label: 'OpenAI 兼容图像接口已连接', details: (payload.data ?? []).flatMap((item) => item.id ? [item.id] : []).slice(0, 20) }
    },
  }
}
