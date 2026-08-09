import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { ModalHost } from './ModalHost'

describe('回合制五行战斗', () => {
  it('物理攻击结算敌我伤害并写入战斗日志', async () => {
    const user = userEvent.setup()
    const battle = { floor: 2, enemyName: '岩壳史莱姆', enemyElement: 'earth' as const, enemyHealth: 20, enemyMaxHealth: 20, turn: 1, log: ['战斗开始。'] }
    render(<GameProvider initialState={{ ...initialGameState, activeModal: 'battle', battle }}><ModalHost /></GameProvider>)
    await user.click(screen.getByRole('button', { name: /物理攻击/ }))
    expect(screen.getByText('生命 16 / 20')).toBeVisible()
    expect(screen.getByText(/造成 4 点物理伤害/)).toBeVisible()
  })

  it('击败龙娘后说明入住或牧场约定结果', async () => {
    const user = userEvent.setup()
    const battle = { floor: 20, enemyName: '龙娘', enemyElement: 'fire' as const, enemyHealth: 1, enemyMaxHealth: 90, turn: 1, log: ['龙巢决战。'] }
    render(<GameProvider initialState={{ ...initialGameState, activeModal: 'battle', battle }}><ModalHost /></GameProvider>)
    await user.click(screen.getByRole('button', { name: /物理攻击/ }))
    expect(screen.getByText(/龙娘已答应在牧场建成后入住/)).toBeVisible()
  })

  it('展开战斗道具栏并提供三种药剂的独立入口', async () => {
    const user = userEvent.setup()
    const battle = { floor: 2, enemyName: '岩壳史莱姆', enemyElement: 'earth' as const, enemyHealth: 20, enemyMaxHealth: 20, turn: 1, log: ['战斗开始。'] }
    render(<GameProvider initialState={{
      ...initialGameState,
      activeModal: 'battle',
      battle,
      inventory: { ...initialGameState.inventory, 'energy-tonic': 1, 'mana-potion': 2, 'fire-potion': 3 },
    }}><ModalHost /></GameProvider>)

    await user.click(screen.getByRole('button', { name: /战斗道具/ }))
    expect(screen.getByRole('button', { name: /金盏恢复剂.*1/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /蓝雾魔力剂.*2/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /流火瓶.*3/ })).toBeVisible()
  })
})
