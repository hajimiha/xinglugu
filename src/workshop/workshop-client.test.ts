import { describe, expect, it, vi } from 'vitest'
import type { WorkshopPackage } from './types'
import { WorkshopClientError, createWorkshopClient } from './workshop-client'

const pkg: WorkshopPackage = {
  schemaVersion: 1, kind: 'preset', title: '测试预设', description: '这是一份完整的创意工坊测试预设。', version: '1.0.0', tags: [],
  createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z',
  payload: { preset: { id: 'p', name: '测试', settings: { main: '规则' }, createdAt: 1, updatedAt: 1 } },
}

describe('创意工坊浏览器客户端', () => {
  it('编码目录筛选并始终使用同源凭据', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ items: [] })))
    const client = createWorkshopClient(fetcher)
    await client.list({ search: '森林 剧情', kind: 'lorebook', sort: 'newest' })
    expect(fetcher).toHaveBeenCalledWith('/api/workshop/catalog?search=%E6%A3%AE%E6%9E%97+%E5%89%A7%E6%83%85&kind=lorebook&sort=newest', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('目录刷新失败时返回本次页面会话最近一次成功结果', async () => {
    const cachedItem = { packageId: 'abcdef12' }
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [cachedItem] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'github_service_unavailable' }), { status: 502 }))
    const client = createWorkshopClient(fetcher)
    await expect(client.list({ sort: 'popular' })).resolves.toEqual([cachedItem])
    await expect(client.list({ sort: 'popular' })).resolves.toEqual([cachedItem])
  })

  it('发布资源并映射登录、配置和冲突错误', async () => {
    const success = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ item: { packageId: 'gist-a' } }), { status: 201 }))
    await createWorkshopClient(success).publish(pkg)
    expect(JSON.parse(String(success.mock.calls[0][1]?.body))).toEqual({ package: pkg })

    for (const [status, code, message] of [
      [401, 'github_login_required', 'GitHub'],
      [503, 'workshop_not_configured', '尚未启用'],
      [409, 'workshop_conflict', '其他设备'],
    ] as const) {
      const client = createWorkshopClient(async () => new Response(JSON.stringify({ error: code }), { status }))
      await expect(client.publish(pkg)).rejects.toThrow(message)
    }
  })

  it('详情在返回前再次严格解析资源包', async () => {
    const client = createWorkshopClient(async () => new Response(JSON.stringify({ package: { ...pkg, apiKey: 'leak' }, owner: { login: 'alice', avatarUrl: '' } })))
    await expect(client.detail('abcdef12')).rejects.toThrow(/不允许字段/)
  })

  it('收藏和撤回使用明确方法，失败保留稳定错误码', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ favorite: true })))
    const client = createWorkshopClient(fetcher)
    await client.favorite('abcdef12', true)
    await client.withdraw('abcdef12', 3)
    expect(fetcher.mock.calls[0][1]?.method).toBe('PUT')
    expect(fetcher.mock.calls[1][1]?.method).toBe('DELETE')

    const failing = createWorkshopClient(async () => new Response(JSON.stringify({ error: 'package_unavailable' }), { status: 404 }))
    await expect(failing.detail('abcdef12')).rejects.toMatchObject({ code: 'package_unavailable' } satisfies Partial<WorkshopClientError>)
  })
})
