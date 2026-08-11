import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider, useGame } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { PlayerNameGate } from './PlayerNameGate'

function ProfileObserver() {
  const { state } = useGame()
  return <output aria-label="当前玩家姓名">{state.playerProfile.name}:{String(state.playerProfile.hasConfirmedName)}</output>
}

describe('首次玩家姓名登记', () => {
  it('要求有效姓名并在确认后关闭登记层', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, playerProfile: { name: '旅行者', hasConfirmedName: false } }}><PlayerNameGate /><ProfileObserver /></GameProvider>)

    const dialog = screen.getByRole('dialog', { name: '登记旅人名' })
    expect(dialog).toBeVisible()
    const input = screen.getByLabelText('玩家姓名')
    expect(input).toHaveAttribute('id', 'player-name-registration-input')

    await user.type(input, '   ')
    await user.click(screen.getByRole('button', { name: '确认姓名并进入性撸谷' }))
    expect(screen.getByRole('alert')).toHaveTextContent('请输入姓名')

    await user.clear(input)
    await user.type(input, '云岚')
    await user.click(screen.getByRole('button', { name: '确认姓名并进入性撸谷' }))
    expect(screen.queryByRole('dialog', { name: '登记旅人名' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('当前玩家姓名')).toHaveTextContent('云岚:true')
  })
})
