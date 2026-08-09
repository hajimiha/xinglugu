import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { FarmWorkshop } from './FarmWorkshop'

describe('农场生产工坊', () => {
  it('提供机器建造、批量加工、动力来源和料理入口', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{
      ...initialGameState,
      money: 2000,
      knownSpells: ['fire-arrow', 'water-needle'],
      inventory: { stone: 50, wood: 30, 'copper-ore': 6, 'ember-berry': 2, honey: 1, flour: 1, milk: 1 },
    }}><FarmWorkshop /></GameProvider>)

    expect(screen.getByRole('region', { name: '农场生产工坊' })).toBeVisible()
    expect(screen.getByRole('button', { name: '建造石砌熔炉，消耗石头 25' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '建造转动磨粉机，消耗木头 20、石头 15和600金币' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '制作莓果挞 1 份' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '建造石砌熔炉，消耗石头 25' }))
    expect(screen.getByText('烧制铜锭')).toBeVisible()
    expect(screen.getByText(/火系魔法可点火/)).toBeVisible()
    const batches = screen.getByRole('spinbutton', { name: '烧制铜锭批数' })
    await user.clear(batches)
    await user.type(batches, '2')
    await user.click(screen.getByRole('button', { name: '开始烧制铜锭，共 2 批' }))
    expect(screen.getByText(/加工中/)).toBeVisible()
    expect(screen.getByText(/魔法点火/)).toBeVisible()
  })
})
