import { describe, expect, it } from 'vitest'
import type { CharacterCard, ChatPreset, ChatSession, TavernSettings } from './types'
import { compileTavernTurn, resolveSessionPreset } from './prompt-compiler'
import { createMistvaleDefaults } from './defaults'

const now = 1
const lorebookEntryDefaults = {
  secondaryKeys: [], order: 1, selective: false, selectiveLogic: 'and_any' as const, constant: false, probability: 100, addMemo: true,
}

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

  it('泛化首轮输入也会以当前角色名命中她的人物世界书档案', () => {
    const archive = createMistvaleDefaults().lorebooks[0]
    const result = compileTavernTurn({
      userInput: '你好。',
      history: [],
      preset: preset('generic-first-turn', '泛化首轮预设'),
      lorebooks: [archive],
      userName: '镜川',
      characterName: '洛岚',
      variables: {},
      extraVariables: { currentLocation: '图书馆' },
    })

    expect(result.matchedEntries.map((match) => match.entry.id)).toContain('mistvale-person-loran')
  })

  it('按世界书有效位置分别发射前置、后置和示例槽位，并报告不支持的位置', () => {
    const result = compileTavernTurn({
      userInput: '触发', history: [], preset: {
        ...preset('placements', 'placements', '', ''), settings: {
          prompts: [
            { identifier: 'worldInfoBefore', role: 'system', content: '' },
            { identifier: 'worldInfoAfter', role: 'system', content: '' },
            { identifier: 'worldInfoBeforeExamples', role: 'system', content: '' },
            { identifier: 'worldInfoAfterExamples', role: 'system', content: '' },
          ],
          prompt_order: [{ character_id: 100001, order: [
            { identifier: 'worldInfoBefore', enabled: true },
            { identifier: 'worldInfoAfter', enabled: true },
            { identifier: 'worldInfoBeforeExamples', enabled: true },
            { identifier: 'worldInfoAfterExamples', enabled: true },
          ] }],
        },
      },
      lorebooks: [{
        id: 'placements', name: 'placements', recursiveScanning: false, caseSensitive: false, matchWholeWords: false, createdAt: 0, updatedAt: 0,
        entries: [
          { id: 'before', ...lorebookEntryDefaults, keys: ['触发'], position: 'before_char', content: 'BEFORE' },
          { id: 'after', ...lorebookEntryDefaults, keys: ['触发'], position: 'after_char', content: 'AFTER' },
          { id: 'example-before', ...lorebookEntryDefaults, keys: ['触发'], position: 'before_example', content: 'EXAMPLE_BEFORE' },
          { id: 'example-after', ...lorebookEntryDefaults, keys: ['触发'], position: 'after_example', content: 'EXAMPLE_AFTER' },
          { id: 'depth', ...lorebookEntryDefaults, keys: ['触发'], position: 'at_depth', depth: 3, content: 'DEPTH_UNSUPPORTED' },
          { id: 'outlet', ...lorebookEntryDefaults, keys: ['触发'], position: 'outlet', content: 'UNSUPPORTED' },
        ],
      }],
      userName: '玩家', characterName: '角色',
    })
    expect(result.systemPrompt).toContain('BEFORE')
    expect(result.systemPrompt).toContain('AFTER')
    expect(result.systemPrompt).toContain('EXAMPLE_BEFORE')
    expect(result.systemPrompt).toContain('EXAMPLE_AFTER')
    expect(result.systemPrompt).not.toContain('DEPTH_UNSUPPORTED')
    expect(result.systemPrompt).not.toContain('UNSUPPORTED')
    expect(result.diagnostics).toContain('未支持的世界书注入位置：at_depth')
    expect(result.diagnostics).toContain('未支持的世界书注入位置：outlet')
  })

  it('orders equal-score matches by collision-safe identity across lorebooks', () => {
    const lorebook = (id: string, content: string) => ({
      id, name: id, recursiveScanning: false, caseSensitive: false, matchWholeWords: false, createdAt: 0, updatedAt: 0,
      entries: [{ id: 'same', ...lorebookEntryDefaults, keys: ['trigger'], position: 'after_char' as const, order: 5, content }],
    })
    const result = compileTavernTurn({
      userInput: 'trigger', history: [], preset: {
        ...preset('identity-order', 'identity-order', '', ''), settings: {
          prompts: [{ identifier: 'worldInfoAfter', role: 'system', content: '' }],
          prompt_order: [{ character_id: 100001, order: [{ identifier: 'worldInfoAfter', enabled: true }] }],
        },
      },
      lorebooks: [lorebook('z-book', 'Z'), lorebook('a-book', 'A')], userName: '玩家', characterName: '角色',
    })
    expect(result.matchedEntries.map((match) => match.identity)).toEqual(['["a-book","same"]', '["z-book","same"]'])
    expect(result.systemPrompt).toContain('A\n\nZ')
  })

  it('按启用的角色卡提示词顺序编译角色内容和宏，并保持当前输入最后', () => {
    const character = {
      ...createMistvaleDefaults().characters[0],
      description: '描述 {{char}}',
      personality: '性格 {{user}}',
      scenario: '场景 {{original}}',
      exampleDialogue: '示例',
    } satisfies CharacterCard
    const result = compileTavernTurn({
      userInput: '当前输入',
      history: [],
      preset: {
        ...preset('character', '角色卡预设', '', ''),
        settings: {
          ...preset('character', '角色卡预设', '', '').settings,
          prompt_order: [{ character_id: 100001, order: [
            { identifier: 'charDescription', enabled: true },
            { identifier: 'charPersonality', enabled: false },
            { identifier: 'scenario', enabled: true },
            { identifier: 'dialogueExamples', enabled: true },
          ] }],
        },
      },
      lorebooks: [],
      userName: '玩家',
      characterName: character.name,
      character,
    })

    expect(result.messages).toEqual([
      { role: 'system', content: `描述 ${character.name}\n\n场景 当前输入\n\n示例` },
      { role: 'user', content: '当前输入' },
    ])
    expect(result.segments.filter((segment) => segment.source === 'character' && segment.sent).map((segment) => segment.identifier))
      .toEqual(['charDescription', 'scenario', 'dialogueExamples'])
  })

  it('先编译全部历史，再用运行时 API 预算省略旧历史并保持最终消息顺序', () => {
    const result = compileTavernTurn({
      userInput: 'current',
      history: [
        { id: 'old', role: 'assistant', content: 'old'.repeat(20), timestamp: now },
        { id: 'newer', role: 'assistant', content: 'newer', timestamp: now },
      ],
      preset: {
        ...preset('runtime-budget', 'runtime-budget', 'system', ''),
        settings: {
          ...preset('runtime-budget', 'runtime-budget', 'system', '').settings,
          max_length: 4,
        },
      },
      lorebooks: [],
      userName: '玩家',
      characterName: '角色',
      budget: { contextLength: 12, maxResponseLength: 2 },
    })

    expect(result.messages).toEqual([
      { role: 'system', content: 'system' },
      { role: 'assistant', content: 'newer' },
      { role: 'user', content: 'current' },
    ])
    expect(result.segments.find((segment) => segment.identifier === 'old')).toMatchObject({ sent: false })
    expect(result.segments.find((segment) => segment.identifier === 'newer')).toMatchObject({ sent: true })
    expect(result.budgetDiagnostics?.omittedSegments).toContain('old')
  })
})
