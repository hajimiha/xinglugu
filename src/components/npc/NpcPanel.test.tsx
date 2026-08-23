import '../../test/setup'
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameProvider, useGame } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { LocationStage } from '../stage/LocationStage'
import { NpcPanel } from './NpcPanel'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../../sillytavern/database'
import { createTavernRepository } from '../../sillytavern/repository'
import { TavernProvider } from '../../tavern/TavernContext'
import { clearSessionApiKey, setSessionApiKey } from '../../sillytavern/api-credentials'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  clearSessionApiKey()
  vi.unstubAllGlobals()
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

function InteractionStateProbe() {
  const { state } = useGame()
  return <output data-testid="interaction-state">精力 {state.energy} · 洛岚好感 {state.relationships.loran.affinity} · 芙蕾雅好感 {state.relationships.freya.affinity}</output>
}

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

  it('旧设备中的损坏角色卡会自动修复并正常打开对话', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-npc-recovery-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const mina = (await repository.listCharacters()).find((card) => card.npcId === 'mina')!
    await database.characters.put({
      ...mina,
      role: null,
      locationId: null,
      firstMessage: null,
      tags: null,
      lorebookIds: null,
    } as never)

    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}>
        <TavernProvider repository={repository}><LocationStage /></TavernProvider>
      </GameProvider>,
    )

    await user.click(await screen.findByRole('button', { name: '与风信使弥奈互动' }))
    await user.click(screen.getByRole('button', { name: '与弥奈交谈' }))

    expect(await screen.findByRole('dialog', { name: '与弥奈的酒馆会话' })).toBeVisible()
    expect(screen.queryByText('弥奈的旧会话无法显示')).not.toBeInTheDocument()
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

  it('赠礼结算后只扣一次精力，并自动把玩家行动发送给模型', async () => {
    const response = '<maintext><scene speaker="narrator">洛岚接过月铃花。</scene><scene speaker="npc" name="洛岚">谢谢你，云岚。</scene></maintext><option>继续交谈</option><sum>云岚赠礼。</sum><vars>{}</vars>'
    const fetchMock = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: response } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    setSessionApiKey('session-secret')
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-gift-dialogue-${crypto.randomUUID()}`)
    render(
      <GameProvider initialState={{
        ...initialGameState,
        location: 'mayor-home',
        minutes: 8 * 60,
        playerProfile: { name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true },
        inventory: { ...initialGameState.inventory, moonflower: 1 },
      }}>
        <TavernProvider repository={createTavernRepository(database)} playerName="云岚">
          <LocationStage />
          <InteractionStateProbe />
        </TavernProvider>
      </GameProvider>,
    )

    await user.click(screen.getByRole('button', { name: '与村长洛岚互动' }))
    await user.click(screen.getByRole('button', { name: '赠礼给洛岚' }))
    await user.click(screen.getByRole('button', { name: /月铃花.*好感 \+14/ }))

    expect(await screen.findByRole('dialog', { name: '与洛岚的酒馆会话' })).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('（云岚）赠礼月铃花给洛岚')
    expect(await screen.findByText('谢谢你，云岚。')).toBeVisible()
    expect(screen.getByTestId('interaction-state')).toHaveTextContent('精力 4 · 洛岚好感 14')
  })

  it('提交委托结算后自动发送交付行动，不额外消耗精力', async () => {
    const response = '<maintext><scene speaker="npc" name="芙蕾雅">雾荚豆正好够用，谢谢你。</scene></maintext><option>询问后续</option><sum>完成委托。</sum><vars>{}</vars>'
    const fetchMock = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: response } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    setSessionApiKey('session-secret')
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-quest-dialogue-${crypto.randomUUID()}`)
    const quest = { ...initialGameState.quests[0], status: 'ready' as const, acceptedDay: 1, deadlineDay: 3 }
    render(
      <GameProvider initialState={{
        ...initialGameState,
        location: 'mayor-home',
        minutes: 8 * 60,
        playerProfile: { name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true },
        inventory: { ...initialGameState.inventory, 'mist-bean': quest.requiredAmount },
        quests: [quest],
      }}>
        <TavernProvider repository={createTavernRepository(database)} playerName="云岚">
          <LocationStage />
          <InteractionStateProbe />
        </TavernProvider>
      </GameProvider>,
    )

    await user.click(screen.getByRole('button', { name: '与草药师芙蕾雅互动' }))
    await user.click(screen.getByRole('button', { name: '向芙蕾雅提交任务' }))
    await user.click(screen.getByRole('button', { name: '提交物品' }))

    expect(await screen.findByRole('dialog', { name: '与芙蕾雅的酒馆会话' })).toBeVisible()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('（云岚）向芙蕾雅提交委托「雾后新芽」所需的 3 份雾荚豆')
    expect(await screen.findByText('雾荚豆正好够用，谢谢你。')).toBeVisible()
    expect(screen.getByTestId('interaction-state')).toHaveTextContent('精力 5')
  })
})
