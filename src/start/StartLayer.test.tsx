// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import '../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('游戏启动层', () => {
  it('首次挂载不渲染游戏画面，开始后才进入游戏', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(document.querySelector('.game-shell')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '开始游戏' }))
    expect(document.querySelector('.game-shell')).toBeInTheDocument()
  })

  it('继续游戏打开应用内存档中心并支持 JSON 导入', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '继续游戏并读取存档' }))

    expect(screen.getByRole('dialog', { name: '读取游戏存档' })).toHaveTextContent('本地存档')
    expect(screen.getByLabelText('导入 JSON 存档')).toBeInTheDocument()
  })

  it('创意工坊打开独立的社区资源中心，不再复用酒馆中枢', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '创意工坊' }))

    const dialog = screen.getByRole('dialog', { name: '创意工坊' })
    expect(dialog).toHaveTextContent('发现资源')
    expect(dialog).toHaveTextContent('我的发布')
    expect(dialog).toHaveTextContent('发布资源')
    expect(dialog).not.toHaveTextContent('酒馆中枢')
  })

  it('GitHub OAuth 未配置时不提供会跳向不可用接口的登录链接', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '创意工坊' }))

    const dialog = screen.getByRole('dialog', { name: '创意工坊' })
    expect(await screen.findByText('GitHub 登录尚未配置')).toBeInTheDocument()
    expect(dialog).not.toContainElement(document.querySelector('#workshop-github-login'))
    await user.click(screen.getByRole('tab', { name: '我的发布' }))
    expect(dialog).toHaveTextContent('部署端尚未配置 GitHub 登录')
    expect(dialog).not.toHaveTextContent('使用 GitHub 登录')
  })
})
