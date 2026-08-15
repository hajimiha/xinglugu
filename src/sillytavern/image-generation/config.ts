import {
  IMAGE_GENERATION_PROVIDERS,
  type ImageGenerationProvider,
  type ImageGenerationSettings,
  type ImagePromptMode,
  type ImagePromptPreset,
  type ImagePromptReplacementKind,
  type ImagePromptReplacementRule,
} from './types'

const DEFAULT_PROMPT_TEMPLATE = `你是游戏场景绘图提示词编辑器。根据当前角色、地点、时间、天气、最近对话、世界书资料和玩家要求，输出一幅连贯画面的绘图提示词。
只输出以下结构，不要解释：
<image_prompt>
<title>简短中文标题</title>
<positive>英文绘图标签或自然语言提示词</positive>
<negative>英文负面提示词</negative>
</image_prompt>`

const DEFAULT_PRESET: ImagePromptPreset = {
  id: 'xinglugu-pixel-default',
  name: '性撸谷像素叙事',
  prefix: 'masterpiece, high quality, detailed pixel art, 32-bit game art, cinematic composition',
  suffix: 'cohesive lighting, expressive character, no text',
  negative: 'low quality, blurry, watermark, signature, text, logo, malformed anatomy',
}

export function createDefaultImageGenerationSettings(): ImageGenerationSettings {
  return {
    version: 1,
    enabled: false,
    providers: [...IMAGE_GENERATION_PROVIDERS],
    provider: 'stable-diffusion',
    prompt: {
      mode: 'llm',
      triggerStart: 'image###',
      triggerEnd: '###',
      historyDepth: 6,
      systemTemplate: DEFAULT_PROMPT_TEMPLATE,
      activePresetId: DEFAULT_PRESET.id,
      presets: [{ ...DEFAULT_PRESET }],
      replacements: [],
    },
    auto: { enabled: false, everyNthAssistantMessage: 1, requireTaggedPrompt: false },
    stableDiffusion: {
      baseUrl: 'http://127.0.0.1:7860', model: '', vae: 'Automatic', sampler: 'DPM++ 2M', scheduler: 'Automatic',
      width: 1024, height: 1024, steps: 28, cfgScale: 7, seed: -1, clipSkip: 2, restoreFaces: false,
      hires: { enabled: false, upscaler: 'Latent', scale: 1.5, steps: 0, denoisingStrength: 0.7 },
      adetailer: { enabled: false, model: 'face_yolov8n.pt', prompt: '', negativePrompt: '' },
    },
    comfyUI: {
      baseUrl: 'http://127.0.0.1:8188', workflowJson: '', outputNodeId: '', model: '', vae: '', sampler: 'euler', scheduler: 'normal',
      width: 1024, height: 1024, steps: 28, cfgScale: 6, seed: -1, pollIntervalMs: 1000, timeoutMs: 180000,
    },
    novelAI: {
      baseUrl: 'https://image.novelai.net', model: 'nai-diffusion-4-5-full', sampler: 'k_euler', scheduler: 'karras',
      width: 1024, height: 1024, steps: 28, scale: 10, cfgRescale: 0.18, seed: 0,
      sm: true, dyn: true, variety: true, decrisper: true, vibeTransfer: false, characterReference: false,
    },
    openAIImage: {
      baseUrl: 'https://api.openai.com/v1', model: 'gpt-image-1', size: '1024x1024', quality: 'auto', style: '', responseFormat: 'b64_json',
    },
    cache: { maxEntries: 80, maxBytes: 512 * 1024 * 1024, retentionDays: 30 },
    ui: { imageAlignment: 'center', imageSizePercent: 100 },
  }
}

type AnyRecord = Record<string, unknown>

function record(value: unknown): AnyRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : {}
}

function string(value: unknown, fallback: string, maxLength = 100000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : fallback
}

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function integer(value: unknown, fallback: number): number {
  return Math.round(number(value, fallback))
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, number(value, fallback)))
}

function normalizeBaseUrl(value: unknown, fallback: string): string {
  return string(value, fallback, 2048).replace(/\/+$/, '')
}

function oneOf<T extends string>(value: unknown, values: readonly T[], fallback: T): T {
  return typeof value === 'string' && values.includes(value as T) ? value as T : fallback
}

function normalizePreset(value: unknown, index: number): ImagePromptPreset | null {
  const source = record(value)
  const name = string(source.name, '', 80)
  if (!name) return null
  return {
    id: string(source.id, `image-preset-${index + 1}`, 120) || `image-preset-${index + 1}`,
    name,
    prefix: string(source.prefix, '', 12000),
    suffix: string(source.suffix, '', 12000),
    negative: string(source.negative, '', 12000),
  }
}

function normalizeReplacement(value: unknown, index: number): ImagePromptReplacementRule | null {
  const source = record(value)
  const search = string(source.search, '', 500)
  if (!search) return null
  return {
    id: string(source.id, `image-replacement-${index + 1}`, 120) || `image-replacement-${index + 1}`,
    enabled: source.enabled !== false,
    kind: oneOf<ImagePromptReplacementKind>(source.kind, ['replace', 'delete', 'prepend', 'append'], 'replace'),
    search,
    replacement: string(source.replacement, '', 2000),
  }
}

export function normalizeImageGenerationSettings(value: unknown): ImageGenerationSettings {
  const defaults = createDefaultImageGenerationSettings()
  const source = record(value)
  const prompt = record(source.prompt)
  const auto = record(source.auto)
  const sd = record(source.stableDiffusion)
  const hires = record(sd.hires)
  const adetailer = record(sd.adetailer)
  const comfy = record(source.comfyUI)
  const novel = record(source.novelAI)
  const openai = record(source.openAIImage)
  const cache = record(source.cache)
  const ui = record(source.ui)
  const imageSizePercent = [25, 50, 75, 100].includes(ui.imageSizePercent as number)
    ? ui.imageSizePercent as 25 | 50 | 75 | 100
    : defaults.ui.imageSizePercent
  const presets = Array.isArray(prompt.presets) ? prompt.presets.map(normalizePreset).filter((item): item is ImagePromptPreset => Boolean(item)) : []
  if (!presets.length) presets.push({ ...defaults.prompt.presets[0] })
  const replacements = Array.isArray(prompt.replacements)
    ? prompt.replacements.map(normalizeReplacement).filter((item): item is ImagePromptReplacementRule => Boolean(item))
    : []
  const activePresetId = string(prompt.activePresetId, presets[0].id, 120)

  return {
    version: 1,
    enabled: source.enabled === true,
    providers: [...IMAGE_GENERATION_PROVIDERS],
    provider: oneOf<ImageGenerationProvider>(source.provider, IMAGE_GENERATION_PROVIDERS, defaults.provider),
    prompt: {
      mode: oneOf<ImagePromptMode>(prompt.mode, ['llm', 'tagged', 'manual'], defaults.prompt.mode),
      triggerStart: string(prompt.triggerStart, defaults.prompt.triggerStart, 80) || defaults.prompt.triggerStart,
      triggerEnd: string(prompt.triggerEnd, defaults.prompt.triggerEnd, 80) || defaults.prompt.triggerEnd,
      historyDepth: Math.round(clamp(prompt.historyDepth, defaults.prompt.historyDepth, 0, 30)),
      systemTemplate: string(prompt.systemTemplate, defaults.prompt.systemTemplate, 24000) || defaults.prompt.systemTemplate,
      activePresetId: presets.some((preset) => preset.id === activePresetId) ? activePresetId : presets[0].id,
      presets,
      replacements,
    },
    auto: {
      enabled: auto.enabled === true,
      everyNthAssistantMessage: Math.round(clamp(auto.everyNthAssistantMessage, defaults.auto.everyNthAssistantMessage, 1, 100)),
      requireTaggedPrompt: auto.requireTaggedPrompt === true,
    },
    stableDiffusion: {
      baseUrl: normalizeBaseUrl(sd.baseUrl, defaults.stableDiffusion.baseUrl),
      model: string(sd.model, defaults.stableDiffusion.model, 500),
      vae: string(sd.vae, defaults.stableDiffusion.vae, 500),
      sampler: string(sd.sampler, defaults.stableDiffusion.sampler, 200),
      scheduler: string(sd.scheduler, defaults.stableDiffusion.scheduler, 200),
      width: integer(sd.width, defaults.stableDiffusion.width),
      height: integer(sd.height, defaults.stableDiffusion.height),
      steps: Math.round(clamp(sd.steps, defaults.stableDiffusion.steps, 1, 150)),
      cfgScale: clamp(sd.cfgScale, defaults.stableDiffusion.cfgScale, 0, 50),
      seed: integer(sd.seed, defaults.stableDiffusion.seed),
      clipSkip: Math.round(clamp(sd.clipSkip, defaults.stableDiffusion.clipSkip, 1, 12)),
      restoreFaces: sd.restoreFaces === true,
      hires: {
        enabled: hires.enabled === true,
        upscaler: string(hires.upscaler, defaults.stableDiffusion.hires.upscaler, 300),
        scale: clamp(hires.scale, defaults.stableDiffusion.hires.scale, 1, 4),
        steps: Math.round(clamp(hires.steps, defaults.stableDiffusion.hires.steps, 0, 150)),
        denoisingStrength: clamp(hires.denoisingStrength, defaults.stableDiffusion.hires.denoisingStrength, 0, 1),
      },
      adetailer: {
        enabled: adetailer.enabled === true,
        model: string(adetailer.model, defaults.stableDiffusion.adetailer.model, 500),
        prompt: string(adetailer.prompt, defaults.stableDiffusion.adetailer.prompt, 12000),
        negativePrompt: string(adetailer.negativePrompt, defaults.stableDiffusion.adetailer.negativePrompt, 12000),
      },
    },
    comfyUI: {
      baseUrl: normalizeBaseUrl(comfy.baseUrl, defaults.comfyUI.baseUrl),
      workflowJson: string(comfy.workflowJson, defaults.comfyUI.workflowJson, 2_000_000),
      outputNodeId: string(comfy.outputNodeId, defaults.comfyUI.outputNodeId, 100),
      model: string(comfy.model, defaults.comfyUI.model, 500),
      vae: string(comfy.vae, defaults.comfyUI.vae, 500),
      sampler: string(comfy.sampler, defaults.comfyUI.sampler, 200),
      scheduler: string(comfy.scheduler, defaults.comfyUI.scheduler, 200),
      width: integer(comfy.width, defaults.comfyUI.width), height: integer(comfy.height, defaults.comfyUI.height),
      steps: Math.round(clamp(comfy.steps, defaults.comfyUI.steps, 1, 150)), cfgScale: clamp(comfy.cfgScale, defaults.comfyUI.cfgScale, 0, 50),
      seed: integer(comfy.seed, defaults.comfyUI.seed),
      pollIntervalMs: Math.round(clamp(comfy.pollIntervalMs, defaults.comfyUI.pollIntervalMs, 250, 10000)),
      timeoutMs: Math.round(clamp(comfy.timeoutMs, defaults.comfyUI.timeoutMs, 5000, 900000)),
    },
    novelAI: {
      baseUrl: normalizeBaseUrl(novel.baseUrl, defaults.novelAI.baseUrl),
      model: string(novel.model, defaults.novelAI.model, 500), sampler: string(novel.sampler, defaults.novelAI.sampler, 200),
      scheduler: string(novel.scheduler, defaults.novelAI.scheduler, 200), width: integer(novel.width, defaults.novelAI.width),
      height: integer(novel.height, defaults.novelAI.height), steps: Math.round(clamp(novel.steps, defaults.novelAI.steps, 1, 50)),
      scale: clamp(novel.scale, defaults.novelAI.scale, 0, 20), cfgRescale: clamp(novel.cfgRescale, defaults.novelAI.cfgRescale, 0, 1),
      seed: integer(novel.seed, defaults.novelAI.seed), sm: novel.sm !== false, dyn: novel.dyn !== false,
      variety: novel.variety !== false, decrisper: novel.decrisper !== false,
      vibeTransfer: novel.vibeTransfer === true, characterReference: novel.characterReference === true,
    },
    openAIImage: {
      baseUrl: normalizeBaseUrl(openai.baseUrl, defaults.openAIImage.baseUrl),
      model: string(openai.model, defaults.openAIImage.model, 500), size: string(openai.size, defaults.openAIImage.size, 100),
      quality: string(openai.quality, defaults.openAIImage.quality, 100), style: string(openai.style, defaults.openAIImage.style, 100),
      responseFormat: oneOf(openai.responseFormat, ['b64_json', 'url'], defaults.openAIImage.responseFormat),
    },
    cache: {
      maxEntries: integer(cache.maxEntries, defaults.cache.maxEntries),
      maxBytes: integer(cache.maxBytes, defaults.cache.maxBytes),
      retentionDays: integer(cache.retentionDays, defaults.cache.retentionDays),
    },
    ui: {
      imageAlignment: oneOf(ui.imageAlignment, ['left', 'center', 'right'], defaults.ui.imageAlignment),
      imageSizePercent,
    },
  }
}

export type ImageGenerationFieldErrors = Record<string, string>

function validateUrl(value: string, label: string): string | undefined {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol)) return `${label}必须使用 HTTP 或 HTTPS。`
    if (url.username || url.password || url.hash) return `${label}不能包含账号、密码或片段。`
  } catch {
    return `请输入完整的${label}。`
  }
  return undefined
}

export function validateImageGenerationSettings(settings: ImageGenerationSettings): ImageGenerationFieldErrors {
  const errors: ImageGenerationFieldErrors = {}
  const endpoints: Array<[string, string]> = [
    ['stableDiffusion.baseUrl', settings.stableDiffusion.baseUrl],
    ['comfyUI.baseUrl', settings.comfyUI.baseUrl],
    ['novelAI.baseUrl', settings.novelAI.baseUrl],
    ['openAIImage.baseUrl', settings.openAIImage.baseUrl],
  ]
  for (const [key, value] of endpoints) {
    const error = validateUrl(value, '接口地址')
    if (error) errors[key] = error
  }
  const dimensions: Array<[string, number]> = [
    ['stableDiffusion.width', settings.stableDiffusion.width], ['stableDiffusion.height', settings.stableDiffusion.height],
    ['comfyUI.width', settings.comfyUI.width], ['comfyUI.height', settings.comfyUI.height],
    ['novelAI.width', settings.novelAI.width], ['novelAI.height', settings.novelAI.height],
  ]
  for (const [key, value] of dimensions) {
    if (!Number.isInteger(value) || value < 64 || value > 4096 || value % 8 !== 0) errors[key] = '尺寸必须是 64–4096 之间且能被 8 整除的整数。'
  }
  if (!Number.isInteger(settings.cache.maxEntries) || settings.cache.maxEntries < 1 || settings.cache.maxEntries > 1000) {
    errors['cache.maxEntries'] = '缓存条目必须是 1–1000 的整数。'
  }
  if (!Number.isSafeInteger(settings.cache.maxBytes) || settings.cache.maxBytes < 1024 * 1024 || settings.cache.maxBytes > 4 * 1024 * 1024 * 1024) {
    errors['cache.maxBytes'] = '缓存空间必须在 1 MB 到 4 GB 之间。'
  }
  if (!Number.isInteger(settings.cache.retentionDays) || settings.cache.retentionDays < 1 || settings.cache.retentionDays > 3650) {
    errors['cache.retentionDays'] = '保留天数必须是 1–3650 的整数。'
  }
  return errors
}
