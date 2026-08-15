import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTavernDatabase, type MistvaleTavernDatabase } from './database'
import { createDefaultImageGenerationSettings } from './image-generation/config'
import type { ImageProviderAdapter } from './image-generation/providers'
import { createImageGenerationRepository } from './image-generation/repository'
import { ImageGenerationService } from './image-generation/service'

describe('酒馆绘图任务服务', () => {
  let database: MistvaleTavernDatabase | undefined

  afterEach(async () => { await database?.delete() })

  it('同一会话串行执行、提交状态并把结果事务写入图片仓库', async () => {
    database = createTavernDatabase(`image-service-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    const order: string[] = []
    const adapter: ImageProviderAdapter = {
      provider: 'stable-diffusion', label: 'fake',
      async generate(input) {
        order.push(`start:${input.positivePrompt}`)
        await Promise.resolve()
        order.push(`end:${input.positivePrompt}`)
        return { blob: new Blob(['png'], { type: 'image/png' }), mimeType: 'image/png', width: 10, height: 10, model: 'fake', seed: 1 }
      },
      async testConnection() { return { label: 'ok' } },
    }
    const service = new ImageGenerationService(repository, { 'stable-diffusion': adapter } as any)
    const base = { sessionId: 's1', npcId: 'npc', settings: createDefaultImageGenerationSettings(), negativePrompt: '', title: '画面' }
    const [first, second] = await Promise.all([
      service.generate({ ...base, positivePrompt: 'first' }),
      service.generate({ ...base, positivePrompt: 'second' }),
    ])
    expect(order).toEqual(['start:first', 'end:first', 'start:second', 'end:second'])
    expect(first.status).toBe('succeeded')
    expect(second.status).toBe('succeeded')
    expect(await repository.listAssetsForSession('s1')).toHaveLength(2)
  })

  it('取消运行任务后保持 cancelled，供应商晚到结果不能覆盖状态', async () => {
    database = createTavernDatabase(`image-cancel-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    let release!: () => void
    const adapter: ImageProviderAdapter = {
      provider: 'stable-diffusion', label: 'fake',
      generate: vi.fn(async () => {
        await new Promise<void>((resolve) => { release = resolve })
        return { blob: new Blob(['png'], { type: 'image/png' }), mimeType: 'image/png', width: 10, height: 10, model: '', seed: 1 }
      }),
      testConnection: vi.fn(async () => ({ label: 'ok' })),
      cancel: vi.fn(async () => undefined),
    }
    const service = new ImageGenerationService(repository, { 'stable-diffusion': adapter } as any)
    const pending = service.generate({
      sessionId: 's1', npcId: 'npc', settings: createDefaultImageGenerationSettings(),
      positivePrompt: 'scene', negativePrompt: '', title: '画面',
    })
    await vi.waitFor(async () => expect((await repository.listActiveJobs()).length).toBe(1))
    const [job] = await repository.listActiveJobs()
    await service.cancel(job.id)
    release()
    const result = await pending
    expect(result.status).toBe('cancelled')
    expect((await repository.getJob(job.id))?.status).toBe('cancelled')
    expect(await repository.listAssetsForSession('s1')).toHaveLength(0)
  })
})
