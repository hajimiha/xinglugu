import '../../test/setup'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { ModalHost } from './ModalHost'

describe('矿洞层级与电梯', () => {
  it('开放已解锁的五层电梯并锁定尚未抵达的十层', () => {
    render(<GameProvider initialState={{ ...initialGameState, location: 'mine', activeModal: 'mine', mine: { currentFloor: 1, highestFloor: 7, unlockedElevators: [5] } }}><ModalHost /></GameProvider>)
    expect(screen.getByRole('button', { name: '搭乘电梯前往第5层' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '第10层电梯尚未解锁' })).toBeDisabled()
    expect(screen.getByText('当前：第 1 层')).toBeVisible()
  })

  it('第十层显示石头与钻石预估，第二十层显示龙巢且不能继续下潜', () => {
    const { unmount } = render(<GameProvider initialState={{ ...initialGameState, location: 'mine', activeModal: 'mine', mine: { currentFloor: 10, highestFloor: 10, unlockedElevators: [5, 10] } }}><ModalHost /></GameProvider>)
    expect(screen.getByText(/石头 4/)).toBeVisible()
    expect(screen.getByText(/钻石 1/)).toBeVisible()
    unmount()

    render(<GameProvider initialState={{ ...initialGameState, location: 'mine', activeModal: 'mine', mine: { currentFloor: 20, highestFloor: 20, unlockedElevators: [5, 10, 15] } }}><ModalHost /></GameProvider>)
    expect(screen.getByText('深层龙巢')).toBeVisible()
    expect(screen.getByRole('button', { name: /迎战龙娘/ })).toBeEnabled()
    expect(screen.queryByRole('button', { name: /前往第 21 层/ })).not.toBeInTheDocument()
  })
})
