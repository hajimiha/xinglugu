import { describe, expect, it, vi } from 'vitest'
import type { WorkshopPackage } from '../../src/workshop/types'
import {
  WORKSHOP_PACKAGE_FILENAME,
  appendCatalogEvent,
  createWorkshopGist,
  listCatalogEvents,
  readWorkshopPackage,
  signCatalogEvent,
} from './workshop-github'

const pkg: WorkshopPackage = {
  schemaVersion: 1, kind: 'preset', title: '细腻叙事预设', description: '用于测试公开工坊发布流程的完整预设。',
  version: '1.0.0', tags: ['叙事'], createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  payload: { preset: { id: 'preset', name: '细腻叙事', settings: { main: '细腻描写。' }, createdAt: 1, updatedAt: 1 } },
}

describe('GitHub 创意工坊 Gist 网关', () => {
  it('创建公开资源 Gist 且不把 token 写入请求体', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
      id: 'gist-a', public: true, owner: { login: 'alice', avatar_url: 'https://example.com/a.png' },
      files: { [WORKSHOP_PACKAGE_FILENAME]: { content: JSON.stringify(pkg) } }, created_at: pkg.createdAt, updated_at: pkg.updatedAt,
    }), { status: 201 }))

    const result = await createWorkshopGist('token-value', pkg, fetcher)
    expect(result.id).toBe('gist-a')
    const [, init] = fetcher.mock.calls[0]
    expect(String(init?.body)).toContain('"public":true')
    expect(String(init?.body)).not.toContain('token-value')
  })

  it('资源正文被截断时从 raw_url 读取并严格解析', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://raw.example/pkg') return new Response(JSON.stringify(pkg))
      return new Response(JSON.stringify({
        id: 'gist-a', public: true, owner: { login: 'alice', avatar_url: '' },
        files: { [WORKSHOP_PACKAGE_FILENAME]: { truncated: true, raw_url: 'https://raw.example/pkg' } },
        created_at: pkg.createdAt, updated_at: pkg.updatedAt,
      }))
    })
    const result = await readWorkshopPackage('gist-a', undefined, fetcher)
    expect(result.package.title).toBe('细腻叙事预设')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('分页读取目录评论并以 GitHub 评论作者覆盖客户端 actor', async () => {
    const secret = 'test-signing-secret-with-at-least-32-chars'
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const page = new URL(String(input)).searchParams.get('page')
      const make = (event: Parameters<typeof signCatalogEvent>[0], login: string, id: number) => ({
        id, body: `XINGLUGU_WORKSHOP_EVENT_V1\n${JSON.stringify(signCatalogEvent(event, secret))}`,
        user: { login, avatar_url: '' }, created_at: pkg.createdAt,
      })
      const body = page === '1' ? Array.from({ length: 100 }, (_, index) => make({
        schemaVersion: 1, eventId: `e-${index}`, action: 'favorite', actor: 'alice', packageId: 'gist-a', occurredAt: pkg.createdAt,
      }, 'alice', index + 1)) : [
        make({ schemaVersion: 1, eventId: 'last', action: 'unfavorite', actor: 'bob', packageId: 'gist-a', occurredAt: pkg.createdAt }, 'bob', 101),
        { id: 102, body: `XINGLUGU_WORKSHOP_EVENT_V1\n${JSON.stringify({ event: { action: 'favorite', actor: 'mallory', packageId: 'gist-a' }, signature: 'forged' })}`, user: { login: 'mallory', avatar_url: '' }, created_at: pkg.createdAt },
      ]
      return new Response(JSON.stringify(body))
    })
    const events = await listCatalogEvents('catalog-id', secret, undefined, fetcher)
    expect(events).toHaveLength(101)
    expect(events[0].actor).toBe('alice')
    expect(events[100].actor).toBe('bob')
  })

  it('追加目录事件时 actor 只由 GitHub 评论作者决定', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ id: 9 }), { status: 201 }))
    await appendCatalogEvent('token', 'catalog-id', {
      schemaVersion: 1, eventId: 'event-1', action: 'favorite', actor: 'alice', packageId: 'gist-a', occurredAt: pkg.createdAt,
    }, 'test-signing-secret-with-at-least-32-chars', fetcher)
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as { body: string }
    expect(body.body).toContain('XINGLUGU_WORKSHOP_EVENT_V1')
    expect(body.body).toContain('"packageId":"gist-a"')
  })
})
