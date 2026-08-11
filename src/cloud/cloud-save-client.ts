export interface GitHubCloudUser {
  login: string
  avatarUrl: string
}

export type CloudAccount =
  | { authenticated: false; configured: boolean }
  | { authenticated: true; configured: true; user: GitHubCloudUser }

export interface CloudSaveSlot {
  exists: boolean
  revision: string | null
  updatedAt: string | null
  serializedSave?: string
}

export interface CloudUploadResult {
  revision: string
  updatedAt: string
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export class CloudConflictError extends Error {
  readonly currentRevision: string | null

  constructor(currentRevision: string | null) {
    super('云存档已在其他设备更新。')
    this.name = 'CloudConflictError'
    this.currentRevision = currentRevision
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string; currentRevision?: string | null }) | null
  if (response.status === 409) throw new CloudConflictError(body?.currentRevision ?? null)
  if (!response.ok) throw new Error(body?.error || `云存档请求失败（${response.status}）`)
  if (!body) throw new Error('云存档服务返回了空响应。')
  return body
}

export function createCloudSaveClient(fetcher: Fetcher = (input, init) => fetch(input, init)) {
  const request = (input: RequestInfo | URL, init: RequestInit = {}) => fetcher(input, {
    ...init,
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...init.headers },
  })

  return {
    getLoginUrl(returnTo = '/'): string {
      return `/api/auth/github/start?returnTo=${encodeURIComponent(returnTo)}`
    },
    async getAccount(): Promise<CloudAccount> {
      return readJson(await request('/api/auth/github/status'))
    },
    async logout(): Promise<void> {
      await readJson(await request('/api/auth/github/logout', { method: 'POST' }))
    },
    async download(): Promise<CloudSaveSlot> {
      return readJson(await request('/api/cloud-save'))
    },
    async upload(serializedSave: string, expectedRevision: string | null, force = false): Promise<CloudUploadResult> {
      return readJson(await request('/api/cloud-save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serializedSave, expectedRevision, force }),
      }))
    },
  }
}

export const cloudSaveClient = createCloudSaveClient()
