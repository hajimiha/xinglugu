import type { ImageGenerationProvider } from '../types'
import type { ImageProviderAdapter, ImageProviderFetch } from './base'
import { createComfyUIAdapter } from './comfyui'
import { createNovelAIAdapter } from './novelai'
import { createOpenAIImageAdapter } from './openai-image'
import { createStableDiffusionAdapter } from './stable-diffusion'

export function createImageProviderAdapters(fetchImpl?: ImageProviderFetch): Record<ImageGenerationProvider, ImageProviderAdapter> {
  return {
    'stable-diffusion': createStableDiffusionAdapter(fetchImpl),
    comfyui: createComfyUIAdapter(fetchImpl),
    novelai: createNovelAIAdapter(fetchImpl),
    'openai-image': createOpenAIImageAdapter(fetchImpl),
  }
}

export * from './base'
