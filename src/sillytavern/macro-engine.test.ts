import { describe, expect, it } from 'vitest'
import { evaluateMacros } from './macro-engine'

const context = {
  userName: '旅行者',
  characterName: '洛岚',
  original: '本轮输入',
  lastUserMessage: '你好',
  lastCharacterMessage: '欢迎来到雾灯谷',
}

describe('SillyTavern 宏引擎', () => {
  it('按预设条目顺序传递 setvar、getvar、addvar 和基础角色宏', () => {
    const first = evaluateMacros(
      '{{setvar::tone::温柔}}{{setvar::count::2}}{{addvar::count::3}}{{trim}}',
      {},
      context,
    )
    const second = evaluateMacros(
      '风格={{getvar::tone}}；次数={{getvar::count}}；{{user}}与{{char}}；{{lastUserMessage}}；{{lastCharMessage}}',
      first.variables,
      context,
    )

    expect(first.text).toBe('')
    expect(first.variables).toMatchObject({ tone: '温柔', count: 5 })
    expect(second.text).toBe('风格=温柔；次数=5；旅行者与洛岚；你好；欢迎来到雾灯谷')
    expect(first.operations.map((operation) => operation.type)).toEqual(['set', 'set', 'add', 'trim'])
  })

  it('兼容真实预设的多行注释、逗号 random、空格 roll、变量占位和未知宏保留', () => {
    const randomValues = [0.6, 0.25]
    const result = evaluateMacros(
      '{{// 以下内容不发送给 AI：\n可跨行。}}随机={{random::a,b,c}}；骰子={{roll 1d6+2}}；${mood}；{{future::keep}}',
      { mood: '晴朗' },
      context,
      { random: () => randomValues.shift() ?? 0 },
    )

    expect(result.text).toBe('随机=b；骰子=4；晴朗；{{future::keep}}')
    expect(result.unknownMacros).toEqual(['{{future::keep}}'])
    expect(result.operations.map((operation) => operation.type)).toEqual(['comment', 'random', 'roll', 'read'])
  })

  it('保持宏名称大小写不敏感、支持双冒号 random 与 original，并记录缺失变量诊断', () => {
    const result = evaluateMacros(
      '{{SETVAR::route::图书馆}}{{TRIM}}去{{random::东门::西门}}；{{ORIGINAL}}；{{GETVAR::missing}}',
      {},
      context,
      { random: () => 0.99 },
    )

    expect(result.text).toBe('去西门；本轮输入；')
    expect(result.variables.route).toBe('图书馆')
    expect(result.diagnostics).toContain('变量 missing 尚未定义。')
  })
})
