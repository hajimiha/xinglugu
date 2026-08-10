import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { TopHud } from './TopHud'

describe('顶部游戏状态栏', () => {
  it('展示地点、精力、金钱和五项技能', () => {
    render(<GameProvider><TopHud /></GameProvider>)

    expect(screen.getByText('苔灯农场')).toBeVisible()
    expect(screen.getByText('5 / 5')).toBeVisible()
    expect(screen.getByText('500')).toBeVisible()
    expect(screen.getByText('第1年 · 春')).toBeVisible()
    expect(screen.getByText(/1月1日/)).toBeVisible()
    expect(screen.getAllByTestId(/^hud-skill-/)).toHaveLength(5)
    expect(screen.getByText('旅行者')).toBeVisible()
  })

  it('点击时间区打开岁时手册', async () => {
    const user = userEvent.setup()
    render(<GameProvider><TopHud /></GameProvider>)
    const button = screen.getByRole('button', { name: /打开岁时手册/ })

    expect(button).toHaveAttribute('id', 'hud-open-calendar')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('通过唯一按钮打开背包', async () => {
    const user = userEvent.setup()
    render(<GameProvider><TopHud /></GameProvider>)
    const button = screen.getByRole('button', { name: '打开背包' })

    expect(button).toHaveAttribute('id', 'hud-open-inventory')
    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('在右侧菜单进入并退出浏览器全屏', async () => {
    const user = userEvent.setup()
    let fullscreenElement: Element | null = null
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = document.documentElement
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exitFullscreen })
    Object.defineProperty(document.documentElement, 'requestFullscreen', { configurable: true, value: requestFullscreen })

    render(<GameProvider><TopHud /></GameProvider>)
    const enter = screen.getByRole('button', { name: '进入全屏' })
    expect(enter).toHaveAttribute('id', 'hud-toggle-fullscreen')
    await user.click(enter)
    expect(requestFullscreen).toHaveBeenCalledTimes(1)

    const exit = screen.getByRole('button', { name: '退出全屏' })
    await user.click(exit)
    expect(exitFullscreen).toHaveBeenCalledTimes(1)
  })
})
