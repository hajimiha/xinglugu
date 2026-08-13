import { parseWorkshopPackage } from './package-schema'
import type { WorkshopCatalogItem, WorkshopKind, WorkshopPackage, WorkshopSort } from './types'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const messages: Record<string, string> = {
  github_login_required: '请先使用 GitHub 登录后再发布或收藏。',
  workshop_not_configured: '部署端尚未启用创意工坊目录。',
  workshop_conflict: '这份资源已在其他设备更新，请刷新后再试。',
  package_unavailable: '这份资源已撤回、删除或无法读取。',
  not_package_owner: '只有资源作者可以更新或撤回。',
  origin_rejected: '请求来源未通过安全校验。',
  github_service_unavailable: 'GitHub 服务暂时不可用，请稍后重试。',
}

export class WorkshopClientError extends Error {
  constructor(readonly code: string, readonly status: number, readonly currentRevision?: number) {
    super(messages[code] ?? code)
    this.name = 'WorkshopClientError'
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null) as (T & { error?: string; currentRevision?: number }) | null
  if (!response.ok) throw new WorkshopClientError(value?.error ?? `http_${response.status}`, response.status, value?.currentRevision)
  if (!value) throw new WorkshopClientError('empty_response', response.status)
  return value
}

export function createWorkshopClient(fetcher: Fetcher = (input, init) => fetch(input, init)) {
  const request = (url: string, init: RequestInit = {}) => fetcher(url, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init.headers },
  })
  return {
    async list(filters: { search?: string; kind?: WorkshopKind | ''; sort?: WorkshopSort } = {}): Promise<WorkshopCatalogItem[]> {
      const query = new URLSearchParams()
      if (filters.search?.trim()) query.set('search', filters.search.trim())
      if (filters.kind) query.set('kind', filters.kind)
      if (filters.sort) query.set('sort', filters.sort)
      const result = await readJson<{ items: WorkshopCatalogItem[] }>(await request(`/api/workshop/catalog${query.size ? `?${query}` : ''}`))
      return result.items
    },
    async detail(packageId: string): Promise<{ package: WorkshopPackage; owner: { login: string; avatarUrl: string } }> {
      const result = await readJson<{ package: unknown; owner: { login: string; avatarUrl: string } }>(await request(`/api/workshop/package?id=${encodeURIComponent(packageId)}`))
      return { ...result, package: parseWorkshopPackage(result.package) }
    },
    async mine(): Promise<WorkshopCatalogItem[]> {
      return (await readJson<{ items: WorkshopCatalogItem[] }>(await request('/api/workshop/mine'))).items
    },
    async publish(pkg: WorkshopPackage): Promise<WorkshopCatalogItem> {
      return (await readJson<{ item: WorkshopCatalogItem }>(await request('/api/workshop/publish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ package: parseWorkshopPackage(pkg) }) }))).item
    },
    async update(packageId: string, expectedRevision: number, pkg: WorkshopPackage): Promise<WorkshopCatalogItem> {
      return (await readJson<{ item: WorkshopCatalogItem }>(await request('/api/workshop/publish', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId, expectedRevision, package: parseWorkshopPackage(pkg) }) }))).item
    },
    async withdraw(packageId: string, expectedRevision: number): Promise<void> {
      await readJson(await request('/api/workshop/publish', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId, expectedRevision }) }))
    },
    async favorite(packageId: string, enabled: boolean): Promise<void> {
      await readJson(await request('/api/workshop/favorite', { method: enabled ? 'PUT' : 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId }) }))
    },
    download(pkg: WorkshopPackage): void {
      const blob = new Blob([JSON.stringify(parseWorkshopPackage(pkg), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${pkg.title.replace(/[\\/:*?"<>|]/g, '-')}-${pkg.version}.json`
      anchor.click()
      URL.revokeObjectURL(url)
    },
  }
}

export const workshopClient = createWorkshopClient()

