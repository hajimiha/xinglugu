import 'fake-indexeddb/auto'
import '../../test/setup'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { npcs } from '../../game/data'
import { GameProvider, useGame } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../../sillytavern/database'
import { clearSessionApiKey, setSessionApiKey } from '../../sillytavern/api-credentials'
import { createTavernRepository } from '../../sillytavern/repository'
import { TavernProvider } from '../../tavern/TavernContext'
import { TavernDialogue } from './TavernDialogue'

let database: MistvaleTavernDatabase | undefined

function GameStateProbe() {
  const { state } = useGame()
  return <output data-testid="game-state-probe">精力 {state.energy} · 好感 {state.relationships.loran.affinity}</output>
}

afterEach(async () => {
  clearSessionApiKey()
  vi.unstubAllGlobals()
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

describe('NPC 酒馆会话', () => {
  it('缺少 API 密钥时预先禁用生成并引导玩家打开接口设置', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-dialogue-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    const saveSessionSpy = vi.spyOn(repository, 'saveSession')
    const loran = npcs.find((npc) => npc.id === 'loran')!

    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}>
        <TavernProvider repository={repository}>
          <TavernDialogue npc={loran} />
          <GameStateProbe />
        </TavernProvider>
      </GameProvider>,
    )

    expect(await screen.findByRole('heading', { name: '与洛岚的酒馆会话' })).toBeVisible()
    const scrollRegion = screen.getByTestId('tavern-dialogue-scroll')
    const composer = screen.getByRole('form', { name: '自由输入对话' })
    expect(scrollRegion).toContainElement(screen.getByLabelText('本回合可选行动'))
    expect(scrollRegion).not.toContainElement(composer)
    expect(scrollRegion.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看会话历史' })).toBeVisible()
    expect(await screen.findByText(/DeepSeek/)).toBeVisible()
    expect(screen.queryByText(/本地叙事|LOCAL TAVERN|只在本机生成/)).not.toBeInTheDocument()
    const action = await screen.findByRole('button', { name: /选择行动：询问今日委托/ })
    await waitFor(() => expect(action).toBeDisabled())
    expect(saveSessionSpy).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('alert')).toHaveTextContent('尚未填写 API 密钥')
    expect(screen.getByRole('button', { name: '打开接口设置' })).toBeVisible()
    expect(screen.getByRole('button', { name: '送出话语' })).toBeDisabled()
    expect(screen.getByTestId('game-state-probe')).toHaveTextContent('精力 5 · 好感 0')
    expect(saveSessionSpy).toHaveBeenCalledTimes(1)
    await waitFor(async () => expect((await repository.listSessions())[0]?.messages).toHaveLength(1))
  })

  it('远程模式使用配置的模型生成并保存 NPC 互动文字', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const response = [
      '<maintext>洛岚翻开空白委托簿，说今天先熟悉村庄就好。</maintext>',
      '<option>询问村庄路线\n聊聊自己的农场</option>',
      '<sum>洛岚建议新玩家先熟悉村庄。</sum>',
      '<vars>{}</vars>',
    ].join('')
    const fetchMock = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: response } }] })}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    setSessionApiKey('session-secret')
    database = createTavernDatabase(`mistvale-remote-dialogue-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const loran = npcs.find((npc) => npc.id === 'loran')!
    const user = userEvent.setup()

    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}>
        <TavernProvider repository={repository}>
          <TavernDialogue npc={loran} />
          <GameStateProbe />
        </TavernProvider>
      </GameProvider>,
    )

    const action = await screen.findByRole('button', { name: /选择行动：询问今日委托/ })
    await waitFor(() => expect(action).toBeEnabled())
    await user.click(action)

    expect(await screen.findByText('洛岚翻开空白委托簿，说今天先熟悉村庄就好。')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', expect.any(Object))
    const requestBody = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(requestBody).toContain('date: 第1年1月1日')
    expect(requestBody).toContain('npcLocation: 村长家')
    expect(requestBody).toContain('npcActivity: 休息并准备一天')
    expect((await repository.listSessions())[0].messages.at(-1)).toMatchObject({
      content: '洛岚翻开空白委托簿，说今天先熟悉村庄就好。',
      apiUsed: 'remote',
    })
    await waitFor(() => expect(screen.getByTestId('game-state-probe')).toHaveTextContent('精力 4 · 好感 6'))
  })

  it('既有会话继续交谈时使用当前激活预设，而不是创建会话时遗留的旧 presetId', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const response = '<maintext>当前预设已生效。</maintext><option>继续</option><sum>验证预设。</sum><vars>{}</vars>'
    const fetchMock = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: response } }] })}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    setSessionApiKey('session-secret')
    database = createTavernDatabase(`mistvale-active-preset-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const [oldPreset] = await repository.listPresets()
    const activePreset = {
      ...structuredClone(oldPreset),
      id: 'active-preset-sentinel',
      name: '当前测试预设',
      settings: {
        ...structuredClone(oldPreset.settings),
        main: 'CURRENT-PRESET-SENTINEL',
        temperature: 1.23,
        top_p: 0.77,
        openai_max_tokens: 2345,
      },
      updatedAt: Date.now() + 10,
    }
    await repository.savePreset({
      ...oldPreset,
      settings: { ...structuredClone(oldPreset.settings), main: 'LEGACY-PRESET-SENTINEL' },
    })
    await repository.savePreset(activePreset)
    const settings = await repository.getSettings()
    await repository.saveSettings({ ...settings, activePresetId: activePreset.id })
    const character = (await repository.listCharacters()).find((card) => card.npcId === 'loran')!
    await repository.saveSession({
      id: 'legacy-preset-session',
      name: '洛岚 · 旧预设会话',
      npcId: 'loran',
      characterId: character.id,
      characterName: character.name,
      userName: '旅行者',
      presetId: oldPreset.id,
      lorebookIds: character.lorebookIds,
      variables: {},
      messages: [{ id: 'opening', role: 'assistant', content: character.firstMessage, timestamp: 1 }],
      createdAt: 1,
      updatedAt: Date.now() + 20,
    })
    const user = userEvent.setup()
    const loran = npcs.find((npc) => npc.id === 'loran')!

    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}>
        <TavernProvider repository={repository}>
          <TavernDialogue npc={loran} />
        </TavernProvider>
      </GameProvider>,
    )

    const action = await screen.findByRole('button', { name: /选择行动：询问今日委托/ })
    await waitFor(() => expect(action).toBeEnabled())
    await user.click(action)
    expect(await screen.findByText('当前预设已生效。')).toBeVisible()
    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('CURRENT-PRESET-SENTINEL')
    expect(body).not.toContain('LEGACY-PRESET-SENTINEL')
    expect(JSON.parse(body)).toMatchObject({ temperature: 1.23, top_p: 0.77, max_tokens: 2345 })
    const [audit] = await repository.listRequestAudits()
    expect(audit).toMatchObject({ presetId: activePreset.id, presetName: activePreset.name, presetBinding: 'follow-active', status: 'succeeded' })
    expect(audit.preparedRequest.messages.some((message) => message.content.includes('CURRENT-PRESET-SENTINEL'))).toBe(true)
    expect(JSON.stringify(audit)).not.toContain('session-secret')
  })

  it('既有会话在玩家改名后使用最新姓名编译预设、世界书与真实请求', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const response = '<maintext>云岚，欢迎回来。</maintext><option>继续</option><sum>洛岚称呼玩家的新名字。</sum><vars>{}</vars>'
    const fetchMock = vi.fn().mockResolvedValue(new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: response } }] })}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    setSessionApiKey('session-secret')
    database = createTavernDatabase(`mistvale-current-player-name-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const character = (await repository.listCharacters()).find((card) => card.npcId === 'loran')!
    await repository.saveSession({
      id: 'stale-name-session', name: '洛岚 · 旧姓名会话', npcId: 'loran', characterId: character.id,
      characterName: character.name, userName: '旅行者', presetId: null, presetBinding: { mode: 'follow-active' },
      lorebookIds: character.lorebookIds, variables: {},
      messages: [{ id: 'opening-name', role: 'assistant', content: character.firstMessage, timestamp: 1 }],
      createdAt: 1, updatedAt: Date.now() + 20,
    })
    const user = userEvent.setup()
    const loran = npcs.find((npc) => npc.id === 'loran')!

    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home', playerProfile: { name: '云岚', hasConfirmedName: true } }}>
        <TavernProvider repository={repository} playerName="云岚"><TavernDialogue npc={loran} /></TavernProvider>
      </GameProvider>,
    )

    const action = await screen.findByRole('button', { name: /选择行动：询问今日委托/ })
    await waitFor(() => expect(action).toBeEnabled())
    await user.click(action)
    expect(await screen.findByText('云岚，欢迎回来。')).toBeVisible()
    const body = String(fetchMock.mock.calls[0]?.[1]?.body)
    expect(body).toContain('云岚')
    expect(body).toContain('玩家姓名')
    expect(body).not.toContain('与 旅行者')
    expect(body).not.toContain('userName: 旅行者')
    expect((await repository.listSessions())[0].userName).toBe('云岚')
  })

  it('远程请求失败时保留玩家输入且不结算精力和好感', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('拒绝访问', { status: 401 })))
    setSessionApiKey('session-secret')
    database = createTavernDatabase(`mistvale-failed-dialogue-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const loran = npcs.find((npc) => npc.id === 'loran')!
    const user = userEvent.setup()

    render(
      <GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}>
        <TavernProvider repository={repository}>
          <TavernDialogue npc={loran} />
          <GameStateProbe />
        </TavernProvider>
      </GameProvider>,
    )

    const input = await screen.findByLabelText('自由输入')
    await waitFor(() => expect(input).toBeEnabled())
    await user.type(input, '今天有什么委托？')
    await user.click(screen.getByRole('button', { name: '送出话语' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/鉴权失败|密钥.*有效|权限/)
    expect(input).toHaveValue('今天有什么委托？')
    expect(screen.getByTestId('game-state-probe')).toHaveTextContent('精力 5 · 好感 0')
  })
})
