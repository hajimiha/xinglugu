import { foldWorkshopCatalog } from '../../src/workshop/catalog.js'
import { parseWorkshopPackage } from '../../src/workshop/package-schema.js'
import type { WorkshopCatalogEvent, WorkshopCatalogItem, WorkshopPackage } from '../../src/workshop/types.js'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { publisherKeyForGitHubId } from './session.js'

export const WORKSHOP_PACKAGE_FILENAME = 'xinglugu-workshop-package-v1.json'
export const WORKSHOP_EVENT_PREFIX = 'XINGLUGU_WORKSHOP_EVENT_V1\n'
const API = 'https://api.github.com'

export interface GitHubWorkshopGist {
  id: string
  public: boolean
  owner: { id: number; login: string; avatar_url: string }
  files: Record<string, { content?: string; raw_url?: string; truncated?: boolean; size?: number }>
  created_at: string
  updated_at: string
  history?: Array<{ version: string }>
  html_url?: string
}

interface GitHubGistComment {
  id: number
  body: string
  user: { id: number; login: string; avatar_url: string }
  created_at: string
}

interface SignedCatalogEvent {
  event: Omit<WorkshopCatalogEvent, 'actor' | 'actorKey' | 'occurredAt'>
  signature: string
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function headers(token?: string): HeadersInit {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  const appAuthorization = !token && clientId && clientSecret
    ? `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
    : undefined
  return {
    Accept: 'application/vnd.github+json',
    ...(token ? { Authorization: `Bearer ${token}` } : appAuthorization ? { Authorization: appAuthorization } : {}),
    'Content-Type': 'application/json',
    'User-Agent': 'xinglugu-workshop',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

async function githubResponse<T>(path: string, token: string | undefined, fetcher: Fetcher, init: RequestInit = {}): Promise<{ value: T; response: Response }> {
  const response = await fetcher(`${API}${path}`, { ...init, headers: { ...headers(token), ...init.headers } })
  const value = await response.json().catch(() => null) as (T & { message?: string }) | null
  if (!response.ok) throw new Error(value?.message || `GitHub API 请求失败（${response.status}）`)
  if (value === null) throw new Error('GitHub API 返回空响应。')
  return { value, response }
}

async function githubJson<T>(path: string, token: string | undefined, fetcher: Fetcher, init: RequestInit = {}): Promise<T> {
  return (await githubResponse<T>(path, token, fetcher, init)).value
}

export async function createWorkshopGist(token: string, pkg: WorkshopPackage, fetcher: Fetcher = fetch): Promise<GitHubWorkshopGist> {
  const safe = parseWorkshopPackage(pkg)
  return githubJson('/gists', token, fetcher, {
    method: 'POST',
    body: JSON.stringify({
      description: `性撸谷创意工坊 · ${safe.title} · xinglugu-workshop-v1`,
      public: true,
      files: { [WORKSHOP_PACKAGE_FILENAME]: { content: JSON.stringify(safe) } },
    }),
  })
}

export async function updateWorkshopGist(token: string, gistId: string, pkg: WorkshopPackage, fetcher: Fetcher = fetch): Promise<GitHubWorkshopGist> {
  const safe = parseWorkshopPackage(pkg)
  return githubJson(`/gists/${encodeURIComponent(gistId)}`, token, fetcher, {
    method: 'PATCH',
    body: JSON.stringify({
      description: `性撸谷创意工坊 · ${safe.title} · xinglugu-workshop-v1`,
      files: { [WORKSHOP_PACKAGE_FILENAME]: { content: JSON.stringify(safe) } },
    }),
  })
}

export async function readWorkshopPackage(gistId: string, token?: string, fetcher: Fetcher = fetch, gistVersion?: string): Promise<{ gist: GitHubWorkshopGist; package: WorkshopPackage }> {
  const versionPath = gistVersion ? `/${encodeURIComponent(gistVersion)}` : ''
  const gist = await githubJson<GitHubWorkshopGist>(`/gists/${encodeURIComponent(gistId)}${versionPath}`, token, fetcher)
  if (!gist.public) throw new Error('创意工坊资源必须是公开 Gist。')
  const file = gist.files[WORKSHOP_PACKAGE_FILENAME]
  if (!file) throw new Error('Gist 中没有创意工坊资源文件。')
  let content = file.content
  if ((!content || file.truncated) && file.raw_url) {
    const rawUrl = new URL(file.raw_url)
    if (rawUrl.protocol !== 'https:' || !['gist.githubusercontent.com', 'raw.githubusercontent.com'].includes(rawUrl.hostname)) {
      throw new Error('invalid_github_raw_url')
    }
    const response = await fetcher(rawUrl, { headers: { Accept: 'application/json', 'User-Agent': 'xinglugu-workshop' } })
    if (!response.ok) throw new Error(`读取工坊资源正文失败（${response.status}）`)
    content = await response.text()
  }
  if (!content) throw new Error('创意工坊资源文件为空。')
  let parsed: unknown
  try { parsed = JSON.parse(content) } catch { throw new Error('创意工坊资源不是有效 JSON。') }
  return { gist, package: parseWorkshopPackage(parsed) }
}

function eventPayload(event: WorkshopCatalogEvent): Omit<WorkshopCatalogEvent, 'actor' | 'actorKey' | 'occurredAt'> {
  const { actor: _actor, actorKey: _actorKey, occurredAt: _occurredAt, ...payload } = event
  return payload
}

function signatureFor(payload: object, secret: string): string {
  return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('base64url')
}

export function signCatalogEvent(event: WorkshopCatalogEvent, secret: string): SignedCatalogEvent {
  const payload = eventPayload(event)
  return { event: payload, signature: signatureFor(payload, secret) }
}

function validSignature(envelope: SignedCatalogEvent, secret: string): boolean {
  if (!envelope.signature || !envelope.event) return false
  const expected = Buffer.from(signatureFor(envelope.event, secret))
  const received = Buffer.from(envelope.signature)
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function parseCatalogComment(comment: GitHubGistComment, signingSecret: string): WorkshopCatalogEvent | null {
  if (!comment.body.startsWith(WORKSHOP_EVENT_PREFIX)) return null
  try {
    const envelope = JSON.parse(comment.body.slice(WORKSHOP_EVENT_PREFIX.length)) as SignedCatalogEvent
    if (!validSignature(envelope, signingSecret)) return null
    const raw = envelope.event
    if (!raw || raw.schemaVersion !== 1 || typeof raw.packageId !== 'string' || typeof raw.eventId !== 'string') return null
    return { ...raw, actorKey: publisherKeyForGitHubId(comment.user.id, signingSecret), actor: comment.user.login, occurredAt: comment.created_at } as WorkshopCatalogEvent
  } catch { return null }
}

export async function listCatalogEvents(catalogGistId: string, signingSecret: string, token?: string, fetcher: Fetcher = fetch): Promise<WorkshopCatalogEvent[]> {
  const events: WorkshopCatalogEvent[] = []
  for (let page = 1; ; page += 1) {
    const result = await githubResponse<GitHubGistComment[]>(`/gists/${encodeURIComponent(catalogGistId)}/comments?per_page=100&page=${page}`, token, fetcher)
    const comments = result.value
    events.push(...comments.map((comment) => parseCatalogComment(comment, signingSecret)).filter((value): value is WorkshopCatalogEvent => Boolean(value)))
    if (!result.response.headers.get('Link')?.includes('rel="next"') && comments.length < 100) break
  }
  return events
}

export async function appendCatalogEvent(token: string, catalogGistId: string, event: WorkshopCatalogEvent, signingSecret: string, fetcher: Fetcher = fetch): Promise<void> {
  await githubJson(`/gists/${encodeURIComponent(catalogGistId)}/comments`, token, fetcher, {
    method: 'POST',
    body: JSON.stringify({ body: `${WORKSHOP_EVENT_PREFIX}${JSON.stringify(signCatalogEvent(event, signingSecret))}` }),
  })
}

export async function readCatalog(catalogGistId: string, signingSecret: string, token?: string, fetcher: Fetcher = fetch) {
  return foldWorkshopCatalog(await listCatalogEvents(catalogGistId, signingSecret, token, fetcher))
}

let publicCatalogCache: { key: string; expiresAt: number; value: Awaited<ReturnType<typeof readCatalog>> } | null = null

export async function readPublicCatalog(catalogGistId: string, signingSecret: string, fetcher: Fetcher = fetch, now = Date.now()) {
  const key = `${catalogGistId}:${signatureFor({ catalogGistId }, signingSecret)}`
  if (publicCatalogCache?.key === key && publicCatalogCache.expiresAt > now) return publicCatalogCache.value
  const value = await readCatalog(catalogGistId, signingSecret, undefined, fetcher)
  publicCatalogCache = { key, expiresAt: now + 30_000, value }
  return value
}

export function invalidatePublicCatalogCache(): void {
  publicCatalogCache = null
}

export function githubOwnerMatchesPublisher(githubId: number, publisherId: string, signingSecret: string): boolean {
  return publisherKeyForGitHubId(githubId, signingSecret) === publisherId
}

export function catalogItemFromPackage(pkg: WorkshopPackage, gist: GitHubWorkshopGist, revision: number, publisherId: string): WorkshopCatalogItem {
  const gistVersion = gist.history?.[0]?.version
  if (!gistVersion) throw new Error('github_gist_version_missing')
  const entryCount = pkg.kind === 'lorebook'
    ? pkg.payload.lorebook.entries.length
    : pkg.kind === 'portrait-pack'
      ? pkg.payload.characters.reduce((sum, character) => sum + character.portraitSlots.length, 0)
      : Object.keys(pkg.payload.preset.settings).length
  return {
    packageId: gist.id,
    kind: pkg.kind,
    title: pkg.title,
    description: pkg.description,
    version: pkg.version,
    tags: [...pkg.tags],
    author: { publisherId, login: gist.owner.login, avatarUrl: gist.owner.avatar_url },
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
    revision,
    gistVersion,
    stats: { entryCount, bytes: new TextEncoder().encode(JSON.stringify(pkg)).byteLength },
  }
}
