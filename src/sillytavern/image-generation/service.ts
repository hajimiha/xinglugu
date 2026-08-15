import type { ImageGenerationReference, ImageGenerationSettings, ImageGenerationJob, ImageGenerationProvider } from './types'
import type { ImageProviderAdapter } from './providers'
import { ImageGenerationRepository } from './repository'

export interface StartImageGenerationInput {
  sessionId: string
  npcId: string
  messageId?: string
  settings: ImageGenerationSettings
  title: string
  positivePrompt: string
  negativePrompt: string
  credential?: string
  retryOfJobId?: string
  references?: ImageGenerationReference[]
}

function publicParameters(settings: ImageGenerationSettings): Record<string, string | number | boolean> {
  if (settings.provider === 'stable-diffusion') {
    const value = settings.stableDiffusion
    return { width: value.width, height: value.height, steps: value.steps, cfgScale: value.cfgScale, seed: value.seed, sampler: value.sampler }
  }
  if (settings.provider === 'comfyui') {
    const value = settings.comfyUI
    return { width: value.width, height: value.height, steps: value.steps, cfgScale: value.cfgScale, seed: value.seed, sampler: value.sampler }
  }
  if (settings.provider === 'novelai') {
    const value = settings.novelAI
    return { width: value.width, height: value.height, steps: value.steps, cfgScale: value.scale, seed: value.seed, sampler: value.sampler }
  }
  return { size: settings.openAIImage.size, quality: settings.openAIImage.quality }
}

export class ImageGenerationService {
  private readonly queues = new Map<string, Promise<void>>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly jobSettings = new Map<string, ImageGenerationSettings>()

  constructor(
    private readonly repository: ImageGenerationRepository,
    private readonly adapters: Record<ImageGenerationProvider, ImageProviderAdapter>,
  ) {}

  async generate(input: StartImageGenerationInput): Promise<ImageGenerationJob> {
    const now = Date.now()
    const job: ImageGenerationJob = {
      id: crypto.randomUUID(),
      sessionId: input.sessionId,
      npcId: input.npcId,
      messageId: input.messageId,
      provider: input.settings.provider,
      status: 'queued',
      title: input.title.trim() || '未命名画面',
      positivePrompt: input.positivePrompt.trim(),
      negativePrompt: input.negativePrompt.trim(),
      parameters: publicParameters(input.settings),
      attempt: input.retryOfJobId ? 2 : 1,
      retryOfJobId: input.retryOfJobId,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    }
    await this.repository.saveJob(job)
    const controller = new AbortController()
    this.controllers.set(job.id, controller)
    this.jobSettings.set(job.id, input.settings)
    const previous = this.queues.get(input.sessionId) ?? Promise.resolve()
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const queueTail = previous.catch(() => undefined).then(() => gate)
    this.queues.set(input.sessionId, queueTail)
    try {
      return await previous.catch(() => undefined).then(async () => {
        if (controller.signal.aborted) return this.repository.updateJob(job.id, { status: 'cancelled', progress: 0 })
        await this.repository.updateJob(job.id, { status: 'generating', progress: 0.05, error: undefined })
        const adapter = this.adapters[input.settings.provider]
        try {
          const result = await adapter.generate({
            settings: input.settings,
            positivePrompt: job.positivePrompt,
            negativePrompt: job.negativePrompt,
            credential: input.credential,
            signal: controller.signal,
            onProgress: (progress) => {
              if (!controller.signal.aborted) void this.repository.updateJob(job.id, { progress: Math.min(0.99, Math.max(0.05, progress)) })
            },
            references: input.references,
          })
          const current = await this.repository.getJob(job.id)
          if (controller.signal.aborted || current?.status === 'cancelled') {
            return current?.status === 'cancelled' ? current : this.repository.updateJob(job.id, { status: 'cancelled', progress: 0 })
          }
          await this.repository.completeJob(job.id, {
            id: crypto.randomUUID(), jobId: job.id, sessionId: job.sessionId, npcId: job.npcId, messageId: job.messageId,
            blob: result.blob, mimeType: result.mimeType, width: result.width, height: result.height, bytes: result.blob.size,
            prompt: job.positivePrompt, negativePrompt: job.negativePrompt, provider: job.provider,
            model: result.model, seed: result.seed, createdAt: Date.now(),
          })
          return (await this.repository.getJob(job.id))!
        } catch (error) {
          const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')
          return this.repository.updateJob(job.id, {
            status: aborted ? 'cancelled' : 'failed',
            progress: aborted ? 0 : undefined,
            error: aborted ? undefined : error instanceof Error ? error.message : '绘图生成失败。',
          })
        }
      })
    } finally {
      release()
      this.controllers.delete(job.id)
      this.jobSettings.delete(job.id)
      if (this.queues.get(input.sessionId) === queueTail) this.queues.delete(input.sessionId)
    }
  }

  async cancel(jobId: string): Promise<ImageGenerationJob | undefined> {
    const job = await this.repository.getJob(jobId)
    if (!job || ['succeeded', 'failed', 'cancelled', 'interrupted'].includes(job.status)) return job
    const controller = this.controllers.get(jobId)
    controller?.abort()
    const settings = this.jobSettings.get(jobId)
    try { if (settings) await this.adapters[job.provider].cancel?.(settings, undefined) } catch {
      // The local request is already cancelled; a provider-side interrupt is best effort.
    }
    return this.repository.updateJob(jobId, { status: 'cancelled', progress: 0, error: undefined })
  }
}
