import { describe, expect, it, vi } from 'vitest'
import { CloudConflictError, createCloudSaveClient } from './cloud-save-client'

describe('GitHub 云存档客户端', () => {
  it('读取登录状态时只使用同源凭据', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ authenticated: true, user: { login: 'player', avatarUrl: 'avatar' } }), {
      headers: { 'Content-Type': 'application/json' },
    }))
    const client = createCloudSaveClient(fetcher)

    await expect(client.getAccount()).resolves.toMatchObject({ authenticated: true, user: { login: 'player' } })
    expect(fetcher).toHaveBeenCalledWith('/api/auth/github/status', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('上传时携带预期版本并把 409 转为明确冲突', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: 'cloud_conflict', currentRevision: 'remote-2' }), {
      status: 409,
      headers: { 'Content-Type': 'application/json' },
    }))
    const client = createCloudSaveClient(fetcher)

    await expect(client.upload('{"schemaVersion":2}', 'local-1')).rejects.toEqual(
      expect.objectContaining<Partial<CloudConflictError>>({ name: 'CloudConflictError', currentRevision: 'remote-2' }),
    )
    expect(fetcher).toHaveBeenCalledWith('/api/cloud-save', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ serializedSave: '{"schemaVersion":2}', expectedRevision: 'local-1', force: false }),
    }))
  })

  it('生成返回标题页的 GitHub 授权地址', () => {
    const client = createCloudSaveClient(vi.fn())
    expect(client.getLoginUrl('/?panel=save')).toBe('/api/auth/github/start?returnTo=%2F%3Fpanel%3Dsave')
  })
})
