import { describe, expect, it, vi } from 'vitest'
import { createMistvaleDefaults } from '../sillytavern/defaults'
import type { TavernApiAdapter } from '../sillytavern/types'
import { createRemoteTurn } from './remote-story-engine'

function createAdapter(response: string) {
  const prepare = vi.fn((request) => ({
    id: 'prepared-request',
    request,
    status: 'preview' as const,
    createdAt: 1,
  }))
  const adapter: TavernApiAdapter = {
    mode: 'remote',
    label: 'DeepSeek · deepseek-v4-flash',
    prepare,
    inspect: (prepared) => ({
      url: 'https://api.deepseek.com/chat/completions', method: 'POST', headers: { Authorization: '[已隐藏]' }, body: { messages: prepared.request.messages },
    }),
    async *stream() {
      yield { type: 'reasoning-delta' as const, text: '核对角色卡' }
      yield { type: 'content-delta' as const, text: response.slice(0, 23) }
      yield { type: 'content-delta' as const, text: response.slice(23) }
      yield { type: 'done' as const }
    },
  }
  return { adapter, prepare }
}

describe('远程酒馆剧情引擎', () => {
  it('将角色卡、世界书、历史和变量组装后解析模型六标签响应', async () => {
    const defaults = createMistvaleDefaults()
    const card = defaults.characters.find((item) => item.npcId === 'loran')!
    const response = [
      '<thinking>查看新人的状态</thinking>',
      '<maintext>洛岚把今日的委托簿推到你面前。</maintext>',
      '<option>查看委托详情\n询问村庄近况</option>',
      '<sum>洛岚向新人展示委托。</sum>',
      '<vars>{"lastTopic":"委托"}</vars>',
    ].join('')
    const { adapter, prepare } = createAdapter(response)
    const streamed: string[] = []
    const reasoning: string[] = []

    const result = await createRemoteTurn({
      api: adapter,
      playerText: '今天有什么委托？',
      history: [],
      preset: defaults.presets[0],
      lorebooks: defaults.lorebooks,
      character: { ...card, description: 'ROLECARD-DESCRIPTION-SENTINEL' },
      userName: '云岚',
      variables: { affinity: 0, money: 500 },
      formatPrompt: defaults.settings.formatPromptTemplate,
      onDelta: (raw) => streamed.push(raw),
      onReasoningDelta: (raw) => reasoning.push(raw),
    })

    expect(result.parsed.maintext).toBe('洛岚把今日的委托簿推到你面前。')
    expect(result.parsed.options).toEqual(['查看委托详情', '询问村庄近况'])
    expect(result.variablePatch).toEqual({ lastTopic: '委托' })
    expect(result.matchedEntryIds.length).toBeGreaterThan(0)
    expect(streamed).toHaveLength(2)
    expect(streamed.at(-1)).toBe(response)
    expect(reasoning).toEqual(['核对角色卡'])
    expect(result.providerReasoning).toBe('核对角色卡')
    expect(result.inspection.compilation.segments.filter((segment) => segment.source === 'character' && segment.sent)).toEqual([])
    expect(result.inspection.compilation.systemPrompt).not.toContain('ROLECARD-DESCRIPTION-SENTINEL')
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      task: 'story',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: expect.stringContaining('洛岚') }),
        { role: 'user', content: '今天有什么委托？' },
      ]),
    }))
    expect(JSON.stringify(prepare.mock.calls[0]?.[0])).toContain('玩家姓名为“云岚”')
    const preparedText = prepare.mock.calls[0]?.[0].messages.map((message: { content: string }) => message.content).join('\n') ?? ''
    expect(preparedText).toContain('<scene speaker="narrator">')
    expect(preparedText).toContain('<scene speaker="npc" name="洛岚">')
    expect(preparedText).toContain('<scene speaker="player" name="云岚">')
    expect(preparedText).not.toContain('允许发言的 NPC 姓名')
  })

  it('多人会话注入每名角色资料、精确姓名白名单和对应分镜示例', async () => {
    const defaults = createMistvaleDefaults()
    const loran = defaults.characters.find((item) => item.npcId === 'loran')!
    const freya = defaults.characters.find((item) => item.npcId === 'freya')!
    const participants = [
      {
        ...loran,
        role: '主角色身份',
        description: '主角色背景资料',
        personality: '主角色性格资料',
        scenario: '主角色场景资料',
        exampleDialogue: '主角色示例对话',
      },
      {
        ...freya,
        role: '受邀角色身份',
        description: '受邀角色背景资料',
        personality: '受邀角色性格资料',
        scenario: '受邀角色场景资料',
        exampleDialogue: '受邀角色示例对话',
      },
    ]
    const { adapter, prepare } = createAdapter('<maintext><scene speaker="npc" name="芙蕾雅">我带来了药草。</scene></maintext><vars>{}</vars>')

    await createRemoteTurn({
      api: adapter,
      playerText: '邀请芙蕾雅一起商量。',
      history: [],
      preset: defaults.presets[0],
      lorebooks: defaults.lorebooks,
      character: participants[0],
      participants,
      userName: '云岚',
      variables: {},
      formatPrompt: defaults.settings.formatPromptTemplate,
    })

    const preparedText = prepare.mock.calls[0]?.[0].messages.map((message: { content: string }) => message.content).join('\n') ?? ''
    expect(preparedText).toContain('允许发言的 NPC 姓名')
    expect(preparedText).toContain('洛岚、芙蕾雅')
    expect(preparedText).toContain('<scene speaker="npc" name="洛岚">')
    expect(preparedText).toContain('<scene speaker="npc" name="芙蕾雅">')
    expect(preparedText).toContain('主角色身份')
    expect(preparedText).toContain('主角色背景资料')
    expect(preparedText).toContain('主角色性格资料')
    expect(preparedText).toContain('主角色场景资料')
    expect(preparedText).toContain('主角色示例对话')
    expect(preparedText).toContain('受邀角色身份')
    expect(preparedText).toContain('受邀角色背景资料')
    expect(preparedText).toContain('受邀角色性格资料')
    expect(preparedText).toContain('受邀角色场景资料')
    expect(preparedText).toContain('受邀角色示例对话')
  })

  it('多人分镜示例会转义可导入角色名中的 XML 特殊字符', async () => {
    const defaults = createMistvaleDefaults()
    const primary = defaults.characters.find((item) => item.npcId === 'loran')!
    const invited = {
      ...defaults.characters.find((item) => item.npcId === 'freya')!,
      name: '芙<蕾&"雅',
    }
    const { adapter, prepare } = createAdapter('<maintext><scene speaker="narrator">夜色渐深。</scene></maintext><vars>{}</vars>')

    await createRemoteTurn({
      api: adapter,
      playerText: '继续交谈。',
      history: [],
      preset: defaults.presets[0],
      lorebooks: defaults.lorebooks,
      character: primary,
      participants: [primary, invited],
      userName: '云岚',
      variables: {},
      formatPrompt: defaults.settings.formatPromptTemplate,
    })

    const preparedText = prepare.mock.calls[0]?.[0].messages.map((message: { content: string }) => message.content).join('\n') ?? ''
    expect(preparedText).toContain('name="芙&lt;蕾&amp;&quot;雅"')
    expect(preparedText).toContain('>芙&lt;蕾&amp;&quot;雅符合自身设定的台词</scene>')
    expect(preparedText).not.toContain('>芙<蕾&"雅符合自身设定的台词</scene>')
  })

  it('模型未输出标签时仍将原始文字作为正文', async () => {
    const defaults = createMistvaleDefaults()
    const { adapter } = createAdapter('洛岚抬眼看向你，示意你在壁炉边坐下。')

    const result = await createRemoteTurn({
      api: adapter,
      playerText: '我可以坐这里吗？',
      history: [],
      preset: defaults.presets[0],
      lorebooks: [],
      character: defaults.characters[0],
      userName: '旅行者',
      variables: {},
      formatPrompt: defaults.settings.formatPromptTemplate,
    })

    expect(result.parsed.maintext).toBe('洛岚抬眼看向你，示意你在壁炉边坐下。')
  })

  it('把预设 setvar 保留为提示词宏变量，不写入会话变量', async () => {
    const defaults = createMistvaleDefaults()
    const { adapter, prepare } = createAdapter('<maintext>我会保持温柔。</maintext><vars>{}</vars>')
    const result = await createRemoteTurn({
      api: adapter,
      playerText: '继续',
      history: [],
      preset: {
        id: 'macro-preset', name: '宏预设', createdAt: 1, updatedAt: 1,
        settings: {
          prompts: [
            { identifier: 'state', role: 'system', content: '{{setvar::tone::温柔}}{{trim}}' },
            { identifier: 'main', role: 'system', content: '本轮语气={{getvar::tone}}' },
          ],
          prompt_order: [{ character_id: 100001, order: [
            { identifier: 'state', enabled: true },
            { identifier: 'main', enabled: true },
          ] }],
        },
      },
      lorebooks: [],
      character: defaults.characters[0],
      userName: '旅行者',
      variables: {},
      formatPrompt: '',
    })

    expect(result.variablePatch).toEqual({})
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([expect.objectContaining({ role: 'system', content: expect.stringContaining('本轮语气=温柔') })]),
    }))
  })
})
