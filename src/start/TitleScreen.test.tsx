import '../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TitleScreen } from './TitleScreen'

describe('TitleScreen', () => {
  it('以完整封面和四个真实按钮路由启动操作', async () => {
    const user = userEvent.setup()
    const actions = {
      onStart: vi.fn(),
      onLoad: vi.fn(),
      onWorkshop: vi.fn(),
      onSettings: vi.fn(),
    }

    render(<TitleScreen hasLocalSave {...actions} />)

    expect(screen.getByRole('heading', { level: 1, name: '性撸谷物语' })).toBeInTheDocument()
    expect(screen.getByAltText('性撸谷物语像素农场封面')).toHaveAttribute('width', '1672')

    for (const name of ['开始游戏', '继续游戏并读取存档', '创意工坊', '设置']) {
      await user.click(screen.getByRole('button', { name }))
    }

    expect(Object.values(actions).every((callback) => callback.mock.calls.length === 1)).toBe(true)
  })
})
