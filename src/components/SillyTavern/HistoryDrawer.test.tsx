import '../../test/setup'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ChatSession } from '../../sillytavern/types'
import { HistoryDrawer } from './HistoryDrawer'

describe('会话历史玩家署名', () => {
  it('使用会话同步后的玩家姓名而不是固定旅行者', () => {
    const session: ChatSession = {
      id: 'history-name', name: '署名测试', characterName: '洛岚', userName: '云岚', presetId: null,
      lorebookIds: [], variables: {}, createdAt: 1, updatedAt: 1,
      messages: [{ id: 'user-message', role: 'user', content: '早上好', timestamp: 1 }],
    }
    render(<HistoryDrawer session={session} onClose={vi.fn()} onBranch={vi.fn()} onTruncate={vi.fn()} />)
    expect(screen.getByText('云岚')).toBeVisible()
    expect(screen.queryByText('旅行者')).not.toBeInTheDocument()
  })
})
