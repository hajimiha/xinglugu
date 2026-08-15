import {
  decodeBase64Image,
  fetchProvider,
  ImageProviderError,
  type ImageProviderAdapter,
  type ImageProviderFetch,
  type ImageProviderResources,
} from './base'

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, '')}${path}`
}

function uniqueNames(items: unknown, keys: string[]): string[] {
  if (!Array.isArray(items)) return []
  return [...new Set(items.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const record = item as Record<string, unknown>
    const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === 'string' && candidate.trim())
    return typeof value === 'string' ? [value.trim()] : []
  }))].sort((a, b) => a.localeCompare(b))
}

export function createStableDiffusionAdapter(
  fetchImpl: ImageProviderFetch = globalThis.fetch.bind(globalThis),
): ImageProviderAdapter {
  return {
    provider: 'stable-diffusion',
    label: 'Stable Diffusion WebUI / Forge',
    async generate({ settings, positivePrompt, negativePrompt, signal, onProgress }) {
      const config = settings.stableDiffusion
      const overrideSettings: Record<string, string | number> = { CLIP_stop_at_last_layers: config.clipSkip }
      if (config.model) overrideSettings.sd_model_checkpoint = config.model
      if (config.vae && config.vae !== 'Automatic') overrideSettings.sd_vae = config.vae
      const payload: Record<string, unknown> = {
        prompt: positivePrompt,
        negative_prompt: negativePrompt,
        seed: config.seed,
        steps: config.steps,
        cfg_scale: config.cfgScale,
        width: config.width,
        height: config.height,
        sampler_name: config.sampler,
        scheduler: config.scheduler,
        restore_faces: config.restoreFaces,
        enable_hr: config.hires.enabled,
        hr_upscaler: config.hires.upscaler,
        hr_scale: config.hires.scale,
        hr_second_pass_steps: config.hires.steps,
        denoising_strength: config.hires.denoisingStrength,
        override_settings: overrideSettings,
        override_settings_restore_afterwards: true,
        save_images: false,
      }
      if (config.adetailer.enabled) {
        payload.alwayson_scripts = {
          ADetailer: {
            args: [true, false, {
              ad_model: config.adetailer.model,
              ad_prompt: config.adetailer.prompt,
              ad_negative_prompt: config.adetailer.negativePrompt,
            }],
          },
        }
      }
      onProgress?.(0.1, '请求已提交到本地绘图服务')
      const response = await fetchProvider(fetchImpl, endpoint(config.baseUrl, '/sdapi/v1/txt2img'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      })
      let result: { images?: string[]; info?: string | Record<string, unknown> }
      try { result = await response.json() } catch {
        throw new ImageProviderError('Stable Diffusion 返回的内容不是有效 JSON。', 'IMAGE_INVALID_RESPONSE')
      }
      const encoded = result.images?.[0]
      if (!encoded) throw new ImageProviderError('Stable Diffusion 没有返回图片。', 'IMAGE_INVALID_RESPONSE')
      let info: Record<string, unknown> = {}
      try { info = typeof result.info === 'string' ? JSON.parse(result.info) : result.info ?? {} } catch { info = {} }
      onProgress?.(1, '绘图完成')
      return {
        blob: decodeBase64Image(encoded),
        mimeType: 'image/png',
        width: config.width,
        height: config.height,
        model: config.model,
        seed: Number(info.seed ?? (Array.isArray(info.all_seeds) ? info.all_seeds[0] : config.seed)),
      }
    },
    async testConnection(settings, _credential, signal) {
      const response = await fetchProvider(fetchImpl, endpoint(settings.stableDiffusion.baseUrl, '/sdapi/v1/options'), { signal })
      const payload = await response.json() as { sd_model_checkpoint?: string }
      return { label: 'Stable Diffusion WebUI 已连接', details: payload.sd_model_checkpoint ? [payload.sd_model_checkpoint] : [] }
    },
    async listResources(settings, _credential, signal): Promise<ImageProviderResources> {
      const baseUrl = settings.stableDiffusion.baseUrl
      const read = async (path: string, keys: string[], optional = true) => {
        try {
          return uniqueNames(await (await fetchProvider(fetchImpl, endpoint(baseUrl, path), { signal })).json(), keys)
        } catch (caught) {
          if (caught instanceof DOMException && caught.name === 'AbortError') throw caught
          if (!optional) throw caught
          return []
        }
      }
      const [models, vaes, samplers, schedulers, upscalers, loras] = await Promise.all([
        read('/sdapi/v1/sd-models', ['title', 'model_name', 'name'], false),
        read('/sdapi/v1/sd-vae', ['model_name', 'filename', 'name']),
        read('/sdapi/v1/samplers', ['name']),
        read('/sdapi/v1/schedulers', ['name', 'label']),
        read('/sdapi/v1/upscalers', ['name']),
        read('/sdapi/v1/loras', ['alias', 'name']),
      ])
      return { models, vaes, samplers, schedulers, upscalers, loras }
    },
    async cancel(settings, signal) {
      await fetchProvider(fetchImpl, endpoint(settings.stableDiffusion.baseUrl, '/sdapi/v1/interrupt'), { method: 'POST', signal })
    },
  }
}
