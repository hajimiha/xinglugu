export const IMAGE_GENERATION_PROVIDERS = [
  'stable-diffusion',
  'comfyui',
  'novelai',
  'openai-image',
] as const

export type ImageGenerationProvider = typeof IMAGE_GENERATION_PROVIDERS[number]
export type ImagePromptMode = 'llm' | 'tagged' | 'manual'
export type ImagePromptReplacementKind = 'replace' | 'delete' | 'prepend' | 'append'

export interface ImagePromptPreset {
  id: string
  name: string
  prefix: string
  suffix: string
  negative: string
}

export interface ImagePromptReplacementRule {
  id: string
  enabled: boolean
  kind: ImagePromptReplacementKind
  search: string
  replacement: string
}

export interface ImageGenerationSettings {
  version: 1
  enabled: boolean
  providers: ImageGenerationProvider[]
  provider: ImageGenerationProvider
  prompt: {
    mode: ImagePromptMode
    triggerStart: string
    triggerEnd: string
    historyDepth: number
    systemTemplate: string
    activePresetId: string
    presets: ImagePromptPreset[]
    replacements: ImagePromptReplacementRule[]
  }
  auto: {
    enabled: boolean
    everyNthAssistantMessage: number
    requireTaggedPrompt: boolean
  }
  stableDiffusion: {
    baseUrl: string
    model: string
    vae: string
    sampler: string
    scheduler: string
    width: number
    height: number
    steps: number
    cfgScale: number
    seed: number
    clipSkip: number
    restoreFaces: boolean
    hires: {
      enabled: boolean
      upscaler: string
      scale: number
      steps: number
      denoisingStrength: number
    }
    adetailer: {
      enabled: boolean
      model: string
      prompt: string
      negativePrompt: string
    }
  }
  comfyUI: {
    baseUrl: string
    workflowJson: string
    outputNodeId: string
    model: string
    vae: string
    sampler: string
    scheduler: string
    width: number
    height: number
    steps: number
    cfgScale: number
    seed: number
    pollIntervalMs: number
    timeoutMs: number
  }
  novelAI: {
    baseUrl: string
    model: string
    sampler: string
    scheduler: string
    width: number
    height: number
    steps: number
    scale: number
    cfgRescale: number
    seed: number
    sm: boolean
    dyn: boolean
    variety: boolean
    decrisper: boolean
    vibeTransfer: boolean
    characterReference: boolean
  }
  openAIImage: {
    baseUrl: string
    model: string
    size: string
    quality: string
    style: string
    responseFormat: 'b64_json' | 'url'
  }
  cache: {
    maxEntries: number
    maxBytes: number
    retentionDays: number
  }
  ui: {
    imageAlignment: 'left' | 'center' | 'right'
    imageSizePercent: 25 | 50 | 75 | 100
  }
}

export type ImageGenerationJobStatus =
  | 'draft'
  | 'preparing'
  | 'queued'
  | 'generating'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export interface ImageGenerationJob {
  id: string
  sessionId: string
  npcId: string
  messageId?: string
  provider: ImageGenerationProvider
  status: ImageGenerationJobStatus
  title: string
  positivePrompt: string
  negativePrompt: string
  parameters: Record<string, string | number | boolean>
  attempt: number
  retryOfJobId?: string
  assetId?: string
  error?: string
  progress?: number
  createdAt: number
  updatedAt: number
}

export interface ImageGenerationAsset {
  id: string
  jobId: string
  sessionId: string
  npcId: string
  messageId?: string
  blob: Blob
  mimeType: string
  width: number
  height: number
  bytes: number
  prompt: string
  negativePrompt: string
  provider: ImageGenerationProvider
  model: string
  seed: number
  createdAt: number
}

export type ImageReferenceKind = 'vibe' | 'character' | 'character-style' | 'style'

export interface ImageGenerationReference {
  id: string
  name: string
  kind: ImageReferenceKind
  blob: Blob
  mimeType: string
  bytes: number
  strength: number
  informationExtracted: number
  enabled: boolean
  createdAt: number
}

export type StoredImageGenerationReference = Omit<ImageGenerationReference, 'blob'> & {
  blobData: ArrayBuffer
}

/** IndexedDB record. ArrayBuffer is used instead of Blob for reliable structured cloning. */
export type StoredImageGenerationAsset = Omit<ImageGenerationAsset, 'blob'> & {
  blobData: ArrayBuffer
}

export interface ImageGenerationCacheBudget {
  maxEntries: number
  maxBytes: number
  retentionDays: number
}
