import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it } from 'vitest'
import { createTavernDatabase, type MistvaleTavernDatabase } from './database'
import { createImageGenerationRepository } from './image-generation/repository'
import type { ImageGenerationJob } from './image-generation/types'

describe('酒馆绘图任务与图片仓库', () => {
  let database: MistvaleTavernDatabase | undefined

  afterEach(async () => {
    await database?.delete()
  })

  function createJob(overrides: Partial<ImageGenerationJob> = {}): ImageGenerationJob {
    return {
      id: crypto.randomUUID(),
      sessionId: 'session-1',
      npcId: 'freya',
      messageId: 'message-1',
      provider: 'stable-diffusion',
      status: 'queued',
      title: '药房的午后',
      positivePrompt: 'pixel art, herbalist',
      negativePrompt: 'text',
      parameters: { width: 1024, height: 1024, seed: -1 },
      attempt: 1,
      createdAt: 100,
      updatedAt: 100,
      ...overrides,
    }
  }

  it('刷新初始化时只把非终态任务标记为中断且可重试', async () => {
    database = createTavernDatabase(`image-jobs-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    await repository.saveJob(createJob({ id: 'running', status: 'generating' }))
    await repository.saveJob(createJob({ id: 'done', status: 'succeeded' }))

    await repository.recoverInterruptedJobs()

    expect(await repository.getJob('running')).toMatchObject({ status: 'interrupted', error: '页面刷新或会话中断，可重新生成。' })
    expect(await repository.getJob('done')).toMatchObject({ status: 'succeeded' })
  })

  it('在同一事务中写入成功任务与图片 Blob，并能按会话读取', async () => {
    database = createTavernDatabase(`image-assets-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    const job = createJob({ id: 'job-1', status: 'generating' })
    await repository.saveJob(job)
    const blob = new Blob(['fake-png'], { type: 'image/png' })

    await repository.completeJob(job.id, {
      id: 'asset-1', jobId: job.id, sessionId: job.sessionId, npcId: job.npcId, messageId: job.messageId,
      blob, mimeType: 'image/png', width: 1024, height: 1024, bytes: blob.size,
      prompt: job.positivePrompt, negativePrompt: job.negativePrompt, provider: job.provider,
      model: 'pixel-model', seed: 42, createdAt: 200,
    })

    expect(await repository.getJob(job.id)).toMatchObject({ status: 'succeeded', assetId: 'asset-1' })
    expect(await repository.listAssetsForSession('session-1')).toHaveLength(1)
    expect((await repository.getAsset('asset-1'))?.blob).toBeInstanceOf(Blob)
  })

  it('按条目和总字节预算清理最旧图片，并同步移除关联记录', async () => {
    database = createTavernDatabase(`image-cleanup-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    for (let index = 0; index < 3; index += 1) {
      const job = createJob({ id: `job-${index}`, createdAt: index + 1, updatedAt: index + 1 })
      await repository.saveJob(job)
      const blob = new Blob([`image-${index}`], { type: 'image/png' })
      await repository.completeJob(job.id, {
        id: `asset-${index}`, jobId: job.id, sessionId: job.sessionId, npcId: job.npcId,
        blob, mimeType: 'image/png', width: 10, height: 10, bytes: blob.size,
        prompt: job.positivePrompt, negativePrompt: '', provider: job.provider, model: '', seed: index, createdAt: index + 1,
      })
    }

    const result = await repository.enforceCacheBudget({ maxEntries: 2, maxBytes: 1024, retentionDays: 365 }, 10)
    expect(result.removedAssetIds).toEqual(['asset-0'])
    expect((await repository.listAssetsForSession('session-1')).map((asset) => asset.id)).toEqual(['asset-2', 'asset-1'])
    expect(await repository.getJob('job-0')).toMatchObject({ assetId: undefined })
  })

  it('把参考图二进制与强度设置持久化，并可更新和删除', async () => {
    database = createTavernDatabase(`image-references-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    await repository.saveReference({ id: 'reference-1', name: '药房氛围.png', kind: 'vibe', blob: new Blob(['image'], { type: 'image/png' }), mimeType: 'image/png', bytes: 5, strength: 0.65, informationExtracted: 0.9, enabled: true, createdAt: 10 })
    const [reference] = await repository.listReferences()
    expect(reference).toMatchObject({ id: 'reference-1', kind: 'vibe', strength: 0.65, informationExtracted: 0.9 })
    expect(reference.blob).toBeInstanceOf(Blob)
    await repository.deleteReference('reference-1')
    expect(await repository.listReferences()).toEqual([])
  })

  it('清空生成历史时原子删除任务与图片，但保留本机参考图', async () => {
    database = createTavernDatabase(`image-clear-${crypto.randomUUID()}`)
    const repository = createImageGenerationRepository(database)
    const job = createJob({ id: 'clear-job', status: 'generating' })
    await repository.saveJob(job)
    const blob = new Blob(['generated'], { type: 'image/png' })
    await repository.completeJob(job.id, {
      id: 'clear-asset', jobId: job.id, sessionId: job.sessionId, npcId: job.npcId,
      blob, mimeType: 'image/png', width: 10, height: 10, bytes: blob.size,
      prompt: job.positivePrompt, negativePrompt: '', provider: job.provider, model: '', seed: 1, createdAt: 200,
    })
    await repository.saveReference({ id: 'keep-reference', name: '保留.png', kind: 'vibe', blob, mimeType: 'image/png', bytes: blob.size, strength: 0.6, informationExtracted: 1, enabled: true, createdAt: 201 })

    await repository.clearArchive()

    expect(await repository.listJobs()).toEqual([])
    expect(await repository.listAssets()).toEqual([])
    expect((await repository.listReferences()).map((item) => item.id)).toEqual(['keep-reference'])
  })
})
