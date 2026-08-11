import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DialogueErrorBoundary } from './DialogueErrorBoundary'

function BrokenDialogue(): never {
  throw new Error('legacy session render failure')
}

describe('DialogueErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('旧会话渲染异常时保留可操作的恢复界面，而不是让整页黑屏', () => {
    const onClose = vi.fn()
    const onReset = vi.fn()
    render(
      <DialogueErrorBoundary npcName="洛岚" onClose={onClose} onReset={onReset}>
        <BrokenDialogue />
      </DialogueErrorBoundary>,
    )

    expect(screen.getByRole('alert').textContent).toContain('洛岚的旧会话无法显示')
    fireEvent.click(screen.getByRole('button', { name: '清理旧会话并重试' }))
    fireEvent.click(screen.getByRole('button', { name: '返回场景' }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
