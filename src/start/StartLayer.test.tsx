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
})
