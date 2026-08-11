import { describe, expect, it } from 'vitest'
import { applyDefinedVariablePatch } from './variable-definitions'
import type { TavernVariableDefinition } from './types'

describe('定义约束变量事务', () => {
  it('按作用域写回、转换类型、限制范围，并拒绝未知键与只读游戏镜像', () => {
    const globalVariables: TavernVariableDefinition[] = [
      { key: 'worldMood', label: '世界气氛', type: 'number', scope: 'global', value: 2, min: 0, max: 10 },
    ]
    const sessionVariables: TavernVariableDefinition[] = [
      { key: 'promised', label: '是否约定', type: 'boolean', scope: 'session', value: false },
      { key: 'topic', label: '话题', type: 'string', scope: 'session', value: '初见' },
    ]

    const result = applyDefinedVariablePatch({
      patch: { worldMood: '99', promised: 'true', topic: 42, money: 999999, invented: '污染' },
      globalDefinitions: globalVariables,
      sessionDefinitions: sessionVariables,
      readOnlyKeys: ['money'],
    })

    expect(result.globalDefinitions).toEqual([
      expect.objectContaining({ key: 'worldMood', value: 10 }),
    ])
    expect(result.sessionDefinitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'promised', value: true }),
      expect.objectContaining({ key: 'topic', value: '42' }),
    ]))
    expect(result.sessionVariables).toEqual({ promised: true, topic: '42' })
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('worldMood'),
      expect.stringContaining('money'),
      expect.stringContaining('invented'),
    ]))
    expect(result.sessionVariables).not.toHaveProperty('worldMood')
    expect(result.sessionVariables).not.toHaveProperty('money')
  })

  it('无法转换的值保持原定义且给出诊断', () => {
    const result = applyDefinedVariablePatch({
      patch: { score: '不是数字' },
      globalDefinitions: [],
      sessionDefinitions: [{ key: 'score', label: '分数', type: 'number', scope: 'session', value: 4 }],
    })

    expect(result.sessionVariables).toEqual({ score: 4 })
    expect(result.diagnostics).toEqual([expect.stringContaining('score')])
  })
})
