import '../../test/setup'
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { LocationStage } from '../stage/LocationStage'
import { NpcPanel } from './NpcPanel'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../../sillytavern/database'
import { createTavernRepository } from '../../sillytavern/repository'
import { TavernProvider } from '../../tavern/TavernContext'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

describe('NPC 关系与灵犀对话', () => {
  it('从洛岚的立绘进入五类互动并打开对话', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-npc-${crypto.randomUUID()}`)
    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}>
        <TavernProvider repository={createTavernRepository(database)}><LocationStage /></TavernProvider>
      </GameProvider>,
    )

    await user.click(screen.getByRole('button', { name: '与村长洛岚互动' }))
    expect(screen.getByRole('dialog', { name: '洛岚互动面板' })).toBeVisible()
    expect(screen.getAllByRole('button', { name: /交谈|赠礼|交易|提交任务|人物档案/ })).toHaveLength(5)

    await user.click(screen.getByRole('button', { name: '与洛岚交谈' }))
    expect(screen.getByRole('dialog', { name: '与洛岚的酒馆会话' })).toBeVisible()
    expect(screen.getByText(/消息将发送到已配置的模型服务/)).toBeVisible()
    expect(screen.queryByText(/本地叙事|不发送网络请求/)).not.toBeInTheDocument()
  })

  it('自由叙事模式允许零精力进入交谈', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-npc-free-${crypto.randomUUID()}`)
    render(
      <GameProvider initialState={{
        ...initialGameState,
        location: 'mayor-home',
        energy: 0,
        rules: { ...initialGameState.rules, energyCostMode: 'free' },
      }}>
        <TavernProvider repository={createTavernRepository(database)}><LocationStage /></TavernProvider>
      </GameProvider>,
    )
    await user.click(screen.getByRole('button', { name: '与村长洛岚互动' }))
    expect(screen.getAllByText('消耗 0 精力')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '与洛岚交谈' }))
    expect(screen.getByRole('dialog', { name: '与洛岚的酒馆会话' })).toBeVisible()
  })

  it('生存压力模式在仅剩一点精力时阻止交谈', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-npc-double-${crypto.randomUUID()}`)
    render(
      <GameProvider initialState={{
        ...initialGameState,
        location: 'mayor-home',
        energy: 1,
        rules: { ...initialGameState.rules, energyCostMode: 'double' },
      }}>
        <TavernProvider repository={createTavernRepository(database)}><LocationStage /></TavernProvider>
      </GameProvider>,
    )
    await user.click(screen.getByRole('button', { name: '与村长洛岚互动' }))
    expect(screen.getAllByText('消耗 2 精力')).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: '与洛岚交谈' }))
    expect(screen.queryByRole('dialog', { name: '与洛岚的酒馆会话' })).not.toBeInTheDocument()
  })

  it('人物档案展示生日、当前地点与当前活动', async () => {
    const user = userEvent.setup()
    render(
      <GameProvider initialState={{ ...initialGameState, location: 'general-store', minutes: 10 * 60 }}>
        <NpcPanel npcId="liuan" />
      </GameProvider>,
    )

    await user.click(screen.getByRole('button', { name: '查看柳安人物档案' }))
    expect(screen.getByText('4月12日')).toBeVisible()
    expect(screen.getByText('杂货店')).toBeVisible()
    expect(screen.getByText('整理货架并经营柜台')).toBeVisible()
    expect(screen.getByText(/生日当天赠送偏爱礼物，好感收益翻倍/)).toBeVisible()
  })

  it('所有角色的赠礼列表都会接受背包中的莓果挞', async () => {
    const user = userEvent.setup()
    render(
      <GameProvider initialState={{
        ...initialGameState,
        inventory: { ...initialGameState.inventory, 'berry-tart': 1 },
      }}>
        <NpcPanel npcId="yanque" />
      </GameProvider>,
    )

    await user.click(screen.getByRole('button', { name: '赠礼给岩雀' }))
    expect(screen.getByRole('button', { name: /莓果挞.*好感 \+10/ })).toBeVisible()
  })
})
