import { describe, expect, it, vi } from 'vitest'
import type { WorkshopPackage } from '../../src/workshop/types'
import { publisherKeyForGitHubId } from './session'
import {
  WORKSHOP_PACKAGE_FILENAME,
  appendCatalogEvent,
  createWorkshopGist,
  listCatalogEvents,
  readWorkshopPackage,
  signCatalogEvent,
  githubOwnerMatchesPublisher,
} from './workshop-github'

const pkg: WorkshopPackage = {
  schemaVersion: 1, kind: 'preset', title: '细腻叙事预设', description: '用于测试公开工坊发布流程的完整预设。',
  version: '1.0.0', tags: ['叙事'], createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  payload: { preset: { id: 'preset', name: '细腻叙事', settings: { main: '细腻描写。' }, createdAt: 1, updatedAt: 1 } },
}

describe('GitHub 创意工坊 Gist 网关', () => {
  it('keeps ownership stable across GitHub login renames without publishing the numeric id', () => {
    const secret = 'test-signing-secret-with-at-least-32-chars'
    expect(githubOwnerMatchesPublisher(101, publisherKeyForGitHubId(101, secret), secret)).toBe(true)
    expect(githubOwnerMatchesPublisher(102, publisherKeyForGitHubId(101, secret), secret)).toBe(false)
  })
  it('创建公开资源 Gist 且不把 token 写入请求体', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
      id: 'gist-a', public: true, owner: { id: 101, login: 'alice', avatar_url: 'https://example.com/a.png' }, history: [{ version: 'sha-a' }],
      files: { [WORKSHOP_PACKAGE_FILENAME]: { content: JSON.stringify(pkg) } }, created_at: pkg.createdAt, updated_at: pkg.updatedAt,
    }), { status: 201 }))

    const result = await createWorkshopGist('token-value', pkg, fetcher)
    expect(result.id).toBe('gist-a')
    const [, init] = fetcher.mock.calls[0]
    expect(String(init?.body)).toContain('"public":true')
    expect(String(init?.body)).not.toContain('token-value')
  })

  it('资源正文被截断时只从 GitHub raw 域读取且不泄露 API 鉴权头', async () => {
    const previousId = process.env.GITHUB_CLIENT_ID
    const previousSecret = process.env.GITHUB_CLIENT_SECRET
    process.env.GITHUB_CLIENT_ID = 'client-id'
    process.env.GITHUB_CLIENT_SECRET = 'client-secret'
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://gist.githubusercontent.com/alice/gist-a/raw/pkg') {
        expect(new Headers(init?.headers).has('Authorization')).toBe(false)
        return new Response(JSON.stringify(pkg))
      }
      return new Response(JSON.stringify({
        id: 'gist-a', public: true, owner: { id: 101, login: 'alice', avatar_url: '' },
        files: { [WORKSHOP_PACKAGE_FILENAME]: { truncated: true, raw_url: 'https://gist.githubusercontent.com/alice/gist-a/raw/pkg' } },
        created_at: pkg.createdAt, updated_at: pkg.updatedAt,
      }))
    })
    try {
      const result = await readWorkshopPackage('gist-a', undefined, fetcher)
      expect(result.package.title).toBe('细腻叙事预设')
      expect(fetcher).toHaveBeenCalledTimes(2)
    } finally {
      if (previousId === undefined) delete process.env.GITHUB_CLIENT_ID
      else process.env.GITHUB_CLIENT_ID = previousId
      if (previousSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET
      else process.env.GITHUB_CLIENT_SECRET = previousSecret
    }
  })

  it('拒绝 Gist 响应提供的非 GitHub raw 主机', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: 'gist-a', public: true, owner: { id: 101, login: 'alice', avatar_url: '' },
      files: { [WORKSHOP_PACKAGE_FILENAME]: { truncated: true, raw_url: 'https://attacker.example/private-package' } },
      created_at: pkg.createdAt, updated_at: pkg.updatedAt,
    })))
    await expect(readWorkshopPackage('gist-a', undefined, fetcher)).rejects.toThrow('raw_url')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('可以读取目录锁定的不可变 Gist 历史版本', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: 'gist-a', public: true, owner: { id: 101, login: 'alice', avatar_url: '' },
      files: { [WORKSHOP_PACKAGE_FILENAME]: { content: JSON.stringify(pkg) } }, created_at: pkg.createdAt, updated_at: pkg.updatedAt,
    })))
    await readWorkshopPackage('gist-a', undefined, fetcher, 'sha-accepted')
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.github.com/gists/gist-a/sha-accepted')
  })

  it('分页读取目录评论并以 GitHub 评论作者覆盖客户端 actor', async () => {
    const secret = 'test-signing-secret-with-at-least-32-chars'
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input)).searchParams.get('page')
      const make = (event: Parameters<typeof signCatalogEvent>[0], login: string, id: number) => ({
        id, body: `XINGLUGU_WORKSHOP_EVENT_V1\n${JSON.stringify(signCatalogEvent(event, secret))}`,
        user: { id: login === 'alice' ? 101 : 102, login, avatar_url: '' }, created_at: pkg.createdAt,
      })
      const body = page === '1' ? Array.from({ length: 100 }, (_, index) => make({
        schemaVersion: 1, eventId: `e-${index}`, action: 'favorite', actorKey: 'ignored-client-key', actor: 'alice', packageId: 'gist-a', occurredAt: pkg.createdAt,
      }, 'alice', index + 1)) : [
        make({ schemaVersion: 1, eventId: 'last', action: 'unfavorite', actorKey: 'ignored-client-key', actor: 'bob', packageId: 'gist-a', occurredAt: pkg.createdAt }, 'bob', 101),
        { id: 102, body: `XINGLUGU_WORKSHOP_EVENT_V1\n${JSON.stringify({ event: { action: 'favorite', actor: 'mallory', packageId: 'gist-a' }, signature: 'forged' })}`, user: { id: 999, login: 'mallory', avatar_url: '' }, created_at: pkg.createdAt },
      ]
      return new Response(JSON.stringify(body))
    })
    const events = await listCatalogEvents('catalog-id', secret, undefined, fetcher)
    expect(events).toHaveLength(101)
    expect(events[0].actor).toBe('alice')
    expect(events[0].actorKey).not.toContain('101')
    expect(events[100].actor).toBe('bob')
  })

  it('追加目录事件时 actor 只由 GitHub 评论作者决定', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 9 }), { status: 201 }))
    await appendCatalogEvent('token', 'catalog-id', {
      schemaVersion: 1, eventId: 'event-1', action: 'favorite', actorKey: 'publisher-alice', actor: 'alice', packageId: 'gist-a', occurredAt: pkg.createdAt,
    }, 'test-signing-secret-with-at-least-32-chars', fetcher)
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { body: string }
    expect(body.body).toContain('XINGLUGU_WORKSHOP_EVENT_V1')
    expect(body.body).toContain('"packageId":"gist-a"')
  })

  it('遵循 GitHub Link 分页，不在第一千条目录事件后静默截断', async () => {
    const secret = 'test-signing-secret-with-at-least-32-chars'
    const event = { schemaVersion: 1 as const, eventId: 'event', action: 'favorite' as const, actorKey: 'publisher-alice', actor: 'alice', packageId: 'gist-a', occurredAt: pkg.createdAt }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = Number(new URL(String(input)).searchParams.get('page'))
      const body = Array.from({ length: page <= 10 ? 100 : 1 }, (_, index) => ({ id: page * 100 + index, body: `XINGLUGU_WORKSHOP_EVENT_V1\n${JSON.stringify(signCatalogEvent({ ...event, eventId: `${page}-${index}` }, secret))}`, user: { id: 101, login: 'alice', avatar_url: '' }, created_at: pkg.createdAt }))
      const headers = page <= 10 ? { Link: `<https://api.github.com/gists/catalog-id/comments?per_page=100&page=${page + 1}>; rel="next"` } : undefined
      return new Response(JSON.stringify(body), { headers })
    })
    expect(await listCatalogEvents('catalog-id', secret, undefined, fetcher)).toHaveLength(1001)
    expect(fetcher).toHaveBeenCalledTimes(11)
  })

  it('uses OAuth app credentials and reuses a short-lived public catalog snapshot', async () => {
    const previousId = process.env.GITHUB_CLIENT_ID
    const previousSecret = process.env.GITHUB_CLIENT_SECRET
    process.env.GITHUB_CLIENT_ID = 'client-id'
    process.env.GITHUB_CLIENT_SECRET = 'client-secret'
    const fetcher = vi.fn(async () => new Response('[]'))
    try {
      const { readPublicCatalog } = await import('./workshop-github')
      await readPublicCatalog('cached-catalog', 'cache-signing-secret', fetcher, 1000)
      await readPublicCatalog('cached-catalog', 'cache-signing-secret', fetcher, 2000)
      expect(fetcher).toHaveBeenCalledTimes(1)
      const requestHeaders = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
      expect(requestHeaders.get('Authorization')).toMatch(/^Basic /)
    } finally {
      if (previousId === undefined) delete process.env.GITHUB_CLIENT_ID
      else process.env.GITHUB_CLIENT_ID = previousId
      if (previousSecret === undefined) delete process.env.GITHUB_CLIENT_SECRET
      else process.env.GITHUB_CLIENT_SECRET = previousSecret
    }
  })
})
