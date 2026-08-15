import type { MistvaleTavernDatabase } from '../database'
import type {
  ImageGenerationAsset,
  ImageGenerationCacheBudget,
  ImageGenerationJob,
  ImageGenerationReference,
  StoredImageGenerationAsset,
  StoredImageGenerationReference,
} from './types'

const ACTIVE_STATUSES = new Set<ImageGenerationJob['status']>(['preparing', 'queued', 'generating'])

function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取图片二进制失败。'))
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })
}

function restoreAsset(record: StoredImageGenerationAsset): ImageGenerationAsset {
  const { blobData, ...metadata } = record
  return { ...metadata, blob: new Blob([blobData], { type: record.mimeType }) }
}

function restoreReference(record: StoredImageGenerationReference): ImageGenerationReference {
  const { blobData, ...metadata } = record
  return { ...metadata, blob: new Blob([blobData], { type: record.mimeType }) }
}

export class ImageGenerationRepository {
  constructor(private readonly database: MistvaleTavernDatabase) {}

  async saveJob(value: ImageGenerationJob): Promise<void> {
    await this.database.imageJobs.put(value)
  }

  async updateJob(id: string, patch: Partial<ImageGenerationJob>): Promise<ImageGenerationJob> {
    return this.database.transaction('rw', this.database.imageJobs, async () => {
      const current = await this.database.imageJobs.get(id)
      if (!current) throw new Error(`找不到绘图任务：${id}`)
      const next = { ...current, ...patch, id: current.id, updatedAt: patch.updatedAt ?? Date.now() }
      await this.database.imageJobs.put(next)
      return next
    })
  }

  getJob(id: string) {
    return this.database.imageJobs.get(id)
  }

  async listJobsForSession(sessionId: string): Promise<ImageGenerationJob[]> {
    return (await this.database.imageJobs.where('sessionId').equals(sessionId).toArray()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async listJobs(): Promise<ImageGenerationJob[]> {
    return (await this.database.imageJobs.toArray()).sort((a, b) => b.createdAt - a.createdAt)
  }

  async listActiveJobs(): Promise<ImageGenerationJob[]> {
    return (await this.database.imageJobs.toArray()).filter((job) => ACTIVE_STATUSES.has(job.status))
  }

  async recoverInterruptedJobs(): Promise<number> {
    const active = await this.listActiveJobs()
    if (!active.length) return 0
    const now = Date.now()
    await this.database.imageJobs.bulkPut(active.map((job) => ({
      ...job,
      status: 'interrupted' as const,
      error: '页面刷新或会话中断，可重新生成。',
      updatedAt: now,
    })))
    return active.length
  }

  async completeJob(jobId: string, asset: ImageGenerationAsset): Promise<void> {
    const { blob, ...metadata } = asset
    const storedAsset: StoredImageGenerationAsset = {
      ...metadata,
      blobData: await readBlobAsArrayBuffer(blob),
    }
    await this.database.transaction('rw', this.database.imageJobs, this.database.imageAssets, async () => {
      const job = await this.database.imageJobs.get(jobId)
      if (!job) throw new Error(`找不到绘图任务：${jobId}`)
      if (['succeeded', 'cancelled'].includes(job.status)) throw new Error('绘图任务已经结束，不能重复写入结果。')
      await this.database.imageAssets.put(storedAsset)
      await this.database.imageJobs.put({
        ...job,
        status: 'succeeded',
        progress: 1,
        assetId: asset.id,
        error: undefined,
        updatedAt: asset.createdAt,
      })
    })
  }

  async getAsset(id: string): Promise<ImageGenerationAsset | undefined> {
    const asset = await this.database.imageAssets.get(id)
    return asset ? restoreAsset(asset) : undefined
  }

  async listAssetsForSession(sessionId: string): Promise<ImageGenerationAsset[]> {
    return (await this.database.imageAssets.where('sessionId').equals(sessionId).toArray())
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(restoreAsset)
  }

  async listAssets(): Promise<ImageGenerationAsset[]> {
    return (await this.database.imageAssets.toArray()).sort((a, b) => b.createdAt - a.createdAt).map(restoreAsset)
  }

  async saveReference(value: ImageGenerationReference): Promise<void> {
    const { blob, ...metadata } = value
    await this.database.imageReferences.put({ ...metadata, blobData: await readBlobAsArrayBuffer(blob) })
  }

  async listReferences(): Promise<ImageGenerationReference[]> {
    return (await this.database.imageReferences.toArray()).sort((a, b) => b.createdAt - a.createdAt).map(restoreReference)
  }

  async deleteReference(id: string): Promise<void> {
    await this.database.imageReferences.delete(id)
  }

  async deleteAsset(id: string): Promise<void> {
    await this.database.transaction('rw', this.database.imageAssets, this.database.imageJobs, async () => {
      await this.database.imageAssets.delete(id)
      const jobs = await this.database.imageJobs.where('assetId').equals(id).toArray()
      if (jobs.length) await this.database.imageJobs.bulkPut(jobs.map((job) => ({ ...job, assetId: undefined })))
    })
  }

  async deleteJob(id: string): Promise<void> {
    const job = await this.database.imageJobs.get(id)
    if (job?.assetId) await this.deleteAsset(job.assetId)
    await this.database.imageJobs.delete(id)
  }

  async clearArchive(): Promise<void> {
    await this.database.transaction('rw', this.database.imageAssets, this.database.imageJobs, async () => {
      await Promise.all([
        this.database.imageAssets.clear(),
        this.database.imageJobs.clear(),
      ])
    })
  }

  async enforceCacheBudget(budget: ImageGenerationCacheBudget, now = Date.now()): Promise<{ removedAssetIds: string[]; bytesRemaining: number }> {
    const assets = (await this.database.imageAssets.toArray()).sort((a, b) => b.createdAt - a.createdAt)
    const expiresBefore = now - budget.retentionDays * 24 * 60 * 60 * 1000
    const keep: StoredImageGenerationAsset[] = []
    const remove: StoredImageGenerationAsset[] = []
    let bytes = 0
    for (const asset of assets) {
      const expired = asset.createdAt < expiresBefore
      const exceedsEntries = keep.length >= budget.maxEntries
      const exceedsBytes = bytes + asset.bytes > budget.maxBytes
      if (expired || exceedsEntries || exceedsBytes) remove.push(asset)
      else { keep.push(asset); bytes += asset.bytes }
    }
    if (remove.length) {
      await this.database.transaction('rw', this.database.imageAssets, this.database.imageJobs, async () => {
        const ids = remove.map((asset) => asset.id)
        await this.database.imageAssets.bulkDelete(ids)
        const affected = (await this.database.imageJobs.toArray()).filter((job) => job.assetId && ids.includes(job.assetId))
        if (affected.length) await this.database.imageJobs.bulkPut(affected.map((job) => ({ ...job, assetId: undefined })))
      })
    }
    return { removedAssetIds: remove.map((asset) => asset.id), bytesRemaining: bytes }
  }
}

export function createImageGenerationRepository(database: MistvaleTavernDatabase): ImageGenerationRepository {
  return new ImageGenerationRepository(database)
}
