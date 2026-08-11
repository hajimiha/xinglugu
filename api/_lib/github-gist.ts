export const CLOUD_GIST_DESCRIPTION = '性撸谷物语云存档 · xinglugu-cloud-save-v1'
export const CLOUD_SAVE_FILENAME = 'xinglugu-save-v1.json'
export const MAX_CLOUD_SAVE_BYTES = 512 * 1024

export interface GitHubGistSummary {
  id: string
  description: string | null
  updated_at: string
  files: Record<string, { content?: string; raw_url?: string; truncated?: boolean }>
  history?: Array<{ version: string }>
}

export interface StoredCloudSave {
  gist: GitHubGistSummary
  serializedSave: string
  revision: string
}

export function findCloudGist(gists: readonly GitHubGistSummary[]): GitHubGistSummary | undefined {
  return gists
    .filter((gist) => gist.description === CLOUD_GIST_DESCRIPTION && CLOUD_SAVE_FILENAME in gist.files)
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))[0]
}

export function validateSerializedSave(serializedSave: string): { schemaVersion: number; savedAt: number; state: Record<string, unknown> } {
  if (new TextEncoder().encode(serializedSave).byteLength > MAX_CLOUD_SAVE_BYTES) {
    throw new Error('云存档不能超过 512 KiB。')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(serializedSave)
  } catch {
    throw new Error('这不是有效的 JSON 游戏存档。')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('这不是有效的游戏存档。')
  const candidate = parsed as Record<string, unknown>
  if ((candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) || !candidate.state || typeof candidate.state !== 'object' || Array.isArray(candidate.state)) {
    throw new Error('这不是有效的游戏存档。')
  }
  return {
    schemaVersion: candidate.schemaVersion,
    savedAt: typeof candidate.savedAt === 'number' && Number.isFinite(candidate.savedAt) ? candidate.savedAt : 0,
    state: candidate.state as Record<string, unknown>,
  }
}

const githubHeaders = (token: string): HeadersInit => ({
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  'User-Agent': 'xinglugu-game',
  'X-GitHub-Api-Version': '2022-11-28',
})

async function githubJson<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { ...githubHeaders(token), ...init.headers },
  })
  const data = await response.json().catch(() => null) as T | { message?: string } | null
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data ? data.message : undefined
    throw new Error(message || `GitHub API 请求失败（${response.status}）`)
  }
  return data as T
}

export async function locateCloudGist(token: string): Promise<GitHubGistSummary | undefined> {
  const candidates: GitHubGistSummary[] = []
  for (let page = 1; page <= 3; page += 1) {
    const pageItems = await githubJson<GitHubGistSummary[]>(token, `/gists?per_page=100&page=${page}`)
    candidates.push(...pageItems)
    if (pageItems.length < 100) break
  }
  return findCloudGist(candidates)
}

export async function readCloudGist(token: string): Promise<StoredCloudSave | null> {
  const summary = await locateCloudGist(token)
  if (!summary) return null
  const gist = await githubJson<GitHubGistSummary>(token, `/gists/${encodeURIComponent(summary.id)}`)
  const file = gist.files[CLOUD_SAVE_FILENAME]
  let serializedSave = file?.content
  if ((!serializedSave || file.truncated) && file?.raw_url) {
    const response = await fetch(file.raw_url, { headers: githubHeaders(token) })
    if (!response.ok) throw new Error(`读取 GitHub Gist 文件失败（${response.status}）`)
    serializedSave = await response.text()
  }
  if (!serializedSave) throw new Error('云存档文件为空。')
  validateSerializedSave(serializedSave)
  return {
    gist,
    serializedSave,
    revision: gist.history?.[0]?.version ?? gist.updated_at,
  }
}

export async function writeCloudGist(token: string, serializedSave: string, existingId?: string): Promise<GitHubGistSummary> {
  validateSerializedSave(serializedSave)
  const body = JSON.stringify({
    description: CLOUD_GIST_DESCRIPTION,
    public: false,
    files: { [CLOUD_SAVE_FILENAME]: { content: serializedSave } },
  })
  return githubJson<GitHubGistSummary>(token, existingId ? `/gists/${encodeURIComponent(existingId)}` : '/gists', {
    method: existingId ? 'PATCH' : 'POST',
    body,
  })
}
