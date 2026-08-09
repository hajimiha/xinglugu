import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider, useGame } from '../../game/GameContext'
import { getDayOfYear } from '../../game/calendar'
import { initialGameState } from '../../game/reducer'
import { ModalHost } from './ModalHost'

function Harness() {
  const { state, dispatch } = useGame()
  return <><button id="test-open-board" type="button" onClick={() => dispatch({ type: 'OPEN_MODAL', modal: 'quest-board' })}>打开委托板</button><output aria-label="当前模态">{state.activeModal ?? '关闭'}</output><ModalHost /></>
}

describe('统一经营模态', () => {
  it('按 Escape 关闭委托板并把焦点归还触发按钮', async () => {
    const user = userEvent.setup()
    render(<GameProvider><Harness /></GameProvider>)
    const trigger = screen.getByRole('button', { name: '打开委托板' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '村民委托板' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '村民委托板' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('平日商店不会出售节日限定种子', () => {
    render(<GameProvider initialState={{
      ...initialGameState,
      location: 'general-store',
      activeModal: 'trade',
      selectedNpcId: 'liuan',
    }}><ModalHost /></GameProvider>)
    expect(screen.queryByText('余烬莓种子')).not.toBeInTheDocument()
    expect(screen.queryByText('潮汐莲种子')).not.toBeInTheDocument()
    expect(screen.queryByText('岩纹南瓜种子')).not.toBeInTheDocument()
  })

  it('节日会场只展示当日对应的限定种子', () => {
    render(<GameProvider initialState={{
      ...initialGameState,
      day: getDayOfYear(6, 21),
      location: 'fisher-home',
      activeModal: 'trade',
      selectedNpcId: 'xiye',
    }}><ModalHost /></GameProvider>)
    expect(screen.getByText('潮汐莲种子')).toBeVisible()
    expect(screen.getByText(/节日限定/)).toBeVisible()
    expect(screen.queryByText('余烬莓种子')).not.toBeInTheDocument()
    expect(screen.queryByText('岩纹南瓜种子')).not.toBeInTheDocument()
  })
})
