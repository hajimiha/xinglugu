// @vitest-environment jsdom
import '../test/setup'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { StartModalFrame } from './StartModalFrame'

describe('启动页多层模态框', () => {
  it('Escape 优先关闭最上层详情而不是整个创意工坊', async () => {
    const user = userEvent.setup()
    const closeFrame = vi.fn()
    const closeLayer = vi.fn()
    render(<StartModalFrame id="frame" title="创意工坊" onClose={closeFrame}>
      <button type="button">底层按钮</button>
      <section role="dialog" aria-modal="true" aria-label="资源详情" data-modal-layer="true">
        <button type="button" data-layer-close="true" onClick={closeLayer}>关闭详情</button>
      </section>
    </StartModalFrame>)
    await user.keyboard('{Escape}')
    expect(closeLayer).toHaveBeenCalledTimes(1)
    expect(closeFrame).not.toHaveBeenCalled()
  })

  it('详情打开时 Tab 焦点不会落到底层按钮', async () => {
    render(<StartModalFrame id="frame" title="创意工坊" onClose={() => undefined}>
      <button type="button">底层按钮</button>
      <section role="dialog" aria-modal="true" aria-label="资源详情" data-modal-layer="true">
        <button type="button" data-layer-close="true">关闭详情</button>
        <button type="button">安装</button>
      </section>
    </StartModalFrame>)
    screen.getByRole('button', { name: '安装' }).focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: '关闭详情' })).toHaveFocus()
  })
})
