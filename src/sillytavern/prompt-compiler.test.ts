import { describe, expect, it } from 'vitest'
import type { ChatPreset, ChatSession, TavernSettings } from './types'
import { compileTavernTurn, resolveSessionPreset } from './prompt-compiler'

const now = 1

function preset(id: string, name: string, before = '前置规则', after = '历史后规则'): ChatPreset {
  return {
    id,
    name,
    createdAt: now,
    updatedAt: now,
    settings: {
      prompts: [
        { identifier: 'before', name: '前置', role: 'system', content: before },
        { identifier: 'chatHistory', name: '历史', role: 'system', marker: true, content: '' },
        { identifier: 'after', name: '后置', role: 'system', content: after },
      ],
      prompt_order: [{
        character_id: 100001,
        order: [
          { identifier: 'before', enabled: true },
          { identifier: 'chatHistory', enabled: true },
          { identifier: 'after', enabled: true },
        ],
      }],
    },
  }
}

describe('严格酒馆提示词编译器', () => {
  it('严格保留预设条目、历史与当前输入的声明顺序，并给每个来源留下追踪记录', () => {
    const result = compileTavernTurn({
      userInput: '继续交谈',
      history: [{ id: 'h1', role: 'assistant', content: '旧对话', timestamp: now }],
      preset: preset('new', '新预设'),
      lorebooks: [],
      userName: '旅行者',
      characterName: '洛岚',
      variables: {},
      extraVariables: {},
    })

    expect(result.messages).toEqual([
      { role: 'system', content: '前置规则' },
      { role: 'assistant', content: '旧对话' },
      { role: 'system', content: '历史后规则' },
      { role: 'user', content: '继续交谈' },
    ])
    expect(result.segments.map((segment) => ({
      source: segment.source,
      identifier: segment.identifier,
      role: segment.role,
      sent: segment.sent,
    }))).toEqual([
      { source: 'preset', identifier: 'before', role: 'system', sent: true },
      { source: 'history', identifier: 'h1', role: 'assistant', sent: true },
      { source: 'preset', identifier: 'after', role: 'system', sent: true },
      { source: 'user', identifier: 'current-user-input', role: 'user', sent: true },
    ])
  })

  it('旧会话没有显式固定能力时必须跟随当前预设，而不是继续偷用创建时的 presetId', () => {
    const oldPreset = preset('old', '旧预设', '旧规则', '')
    const activePreset = preset('active', '当前预设', '当前规则', '')
    const legacySession = {
      id: 'legacy-session',
      name: '旧会话',
      messages: [],
      characterName: '洛岚',
      userName: '旅行者',
      presetId: oldPreset.id,
      lorebookIds: [],
      variables: {},
      createdAt: now,
      updatedAt: now,
    } satisfies ChatSession
    const settings = {
      activePresetId: activePreset.id,
    } as TavernSettings

    expect(resolveSessionPreset(legacySession, settings, [oldPreset, activePreset])).toBe(activePreset)
  })

  it('只有玩家显式固定会话预设时才使用固定项', () => {
    const pinned = preset('pinned', '固定预设')
    const active = preset('active', '当前预设')
    const session = {
      id: 'pinned-session',
      name: '固定会话',
      messages: [],
      characterName: '洛岚',
      userName: '旅行者',
      presetId: null,
      presetBinding: { mode: 'pinned', presetId: pinned.id },
      lorebookIds: [],
      variables: {},
      createdAt: now,
      updatedAt: now,
    } satisfies ChatSession
    const settings = { activePresetId: active.id } as TavernSettings

    expect(resolveSessionPreset(session, settings, [pinned, active])).toBe(pinned)
  })

  it('按条目顺序执行 SillyTavern 宏并把最终结果真正放进出站消息', () => {
    const macroPreset = preset('macro', '宏预设', '{{setvar::tone::温柔}}{{//仅本地注释}}{{trim}}', '语气={{getvar::tone}}；玩家={{user}}；上一句={{lastCharMessage}}')
    const result = compileTavernTurn({
      userInput: '继续',
      history: [{ id: 'h1', role: 'assistant', content: '别担心，我在这里。', timestamp: now }],
      preset: macroPreset,
      lorebooks: [],
      userName: '旅行者',
      characterName: '洛岚',
      variables: {},
      extraVariables: {},
    })

    expect(result.messages).toContainEqual({
      role: 'system',
      content: '语气=温柔；玩家=旅行者；上一句=别担心，我在这里。',
    })
    expect(JSON.stringify(result.messages)).not.toContain('{{')
    expect(result.macroVariables).toMatchObject({ tone: '温柔' })
  })
})
