import '../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameProvider } from '../game/GameContext'
import { SaveCenterModal, type CloudSaveController } from './SaveCenterModal'

function renderCenter(cloud: CloudSaveController) {
  const onEnterGame = vi.fn()
  render(<GameProvider storage={null}><SaveCenterModal cloud={cloud} onEnterGame={onEnterGame} /></GameProvider>)
  return onEnterGame
}

describe('启动页存档中心', () => {
  it('未登录时提供 GitHub 官方授权入口', () => {
    renderCenter({
      account: { authenticated: false, configured: true }, slot: null, busy: false, status: '', conflict: false,
      autoSync: false, loginUrl: '/api/auth/github/start?returnTo=%2F',
      refresh: vi.fn(), logout: vi.fn(), upload: vi.fn(), download: vi.fn(), setAutoSync: vi.fn(),
    })
    expect(screen.getByRole('link', { name: '使用 GitHub 登录' })).toHaveAttribute('href', '/api/auth/github/start?returnTo=%2F')
  })

  it('读取云档成功后进入游戏', async () => {
    const user = userEvent.setup()
    const download = vi.fn(async () => true)
    const onEnterGame = renderCenter({
      account: { authenticated: true, configured: true, user: { login: 'player', avatarUrl: '' } },
      slot: { exists: true, revision: 'revision-1', updatedAt: '2026-08-11T12:00:00Z' },
      busy: false, status: '', conflict: false, autoSync: true, loginUrl: '',
      refresh: vi.fn(), logout: vi.fn(), upload: vi.fn(), download, setAutoSync: vi.fn(),
    })
    await user.click(screen.getByRole('button', { name: '读取云端进度' }))
    expect(download).toHaveBeenCalledOnce()
    expect(onEnterGame).toHaveBeenCalledOnce()
  })
})
