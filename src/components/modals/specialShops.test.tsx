import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { ModalHost } from './ModalHost'

describe('铁匠与魔女专属柜台', () => {
  it('展示三条工具升级路线与永久上限药剂', () => {
    const { unmount } = render(<GameProvider initialState={{ ...initialGameState, location: 'smithy', activeModal: 'trade', selectedNpcId: 'yanque' }}><ModalHost /></GameProvider>)
    expect(screen.getByRole('button', { name: /打造铜锭锄头/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /打造铜锭镐/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /打造铜锭长剑/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /打造铜锭护甲/ })).toBeVisible()
    expect(screen.queryByRole('button', { name: /精炼铜矿石/ })).not.toBeInTheDocument()
    unmount()
    render(<GameProvider initialState={{ ...initialGameState, location: 'witch-home', activeModal: 'trade', selectedNpcId: 'daifu' }}><ModalHost /></GameProvider>)
    expect(screen.getByRole('button', { name: /购买金盏恒息药/ })).toBeVisible()
    expect(screen.getByRole('button', { name: /购买蓝雾扩容药/ })).toBeVisible()
  })

  it('牧场只展示五位可购买伙伴和不可售卖的龙娘档案', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, money: 10000, activeModal: 'ranch' }}><ModalHost /></GameProvider>)

    for (const name of ['牛奶娘', '蜂娘', '蜘蛛娘', '火史莱姆娘', '水史莱姆娘', '龙娘']) {
      expect(screen.getByRole('heading', { name })).toBeVisible()
    }
    expect(screen.queryByText('蘑菇娘')).not.toBeInTheDocument()
    expect(screen.getByText(/龙娘不在商店售卖/)).toBeVisible()
    expect(screen.getByText(/免精力为熔炉点火/)).toBeVisible()
    expect(screen.getByText(/免精力驱动磨粉机/)).toBeVisible()

    await user.click(screen.getByRole('button', { name: '签署牧场合同' }))
    await user.click(screen.getByRole('button', { name: '邀请牛奶娘，花费 1500 金币' }))
    expect(screen.getByRole('button', { name: '牛奶娘已经入住' })).toBeDisabled()
    expect(screen.getByText('每日产物：牛奶 ×1')).toBeVisible()
  })
})
