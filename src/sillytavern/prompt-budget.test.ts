import { describe, expect, it } from 'vitest'
import type { PromptTraceSegment, TavernMessageRole } from './types'
import { applyPromptBudget } from './prompt-budget'

function segment(identifier: string, source: PromptTraceSegment['source'], role: TavernMessageRole, compiled: string): PromptTraceSegment {
  return { id: identifier, source, identifier, role, raw: compiled, compiled, sent: true, tokenEstimate: compiled.length, diagnostics: [] }
}

describe('最终酒馆提示词预算', () => {
  it('预留回复空间，保留必需系统段、最新输入和最近历史，并明确诊断被省略的旧历史', () => {
    const result = applyPromptBudget({
      messages: [
        { role: 'system', content: '系统规则'.repeat(4) },
        { role: 'assistant', content: '最旧回答'.repeat(4) },
        { role: 'user', content: '旧问题'.repeat(4) },
        { role: 'assistant', content: '最近回答' },
        { role: 'user', content: '当前输入' },
      ],
      segments: [
        segment('system', 'preset', 'system', '系统规则'.repeat(4)),
        segment('old-answer', 'history', 'assistant', '最旧回答'.repeat(4)),
        segment('old-question', 'history', 'user', '旧问题'.repeat(4)),
        segment('recent-answer', 'history', 'assistant', '最近回答'),
        segment('current-user-input', 'user', 'user', '当前输入'),
      ],
      contextLength: 30,
      maxResponseLength: 5,
      tokenEstimator: (content) => content.length,
    })

    expect(result.messages.map((message) => message.content)).toEqual([
      '系统规则'.repeat(4),
      '最近回答',
      '当前输入',
    ])
    expect(result.segments.filter((item) => item.sent).map((item) => item.identifier)).toEqual([
      'system', 'recent-answer', 'current-user-input',
    ])
    expect(result.diagnostics.promptTokens).toBe(24)
    expect(result.diagnostics.reservedResponseTokens).toBe(5)
    expect(result.diagnostics.omittedSegments).toEqual(['old-answer', 'old-question'])
  })

  it('系统内容单独超出预算时仍保留当前用户输入并报告上下文溢出', () => {
    const result = applyPromptBudget({
      messages: [
        { role: 'system', content: '系统规则'.repeat(10) },
        { role: 'user', content: '当前输入' },
      ],
      segments: [
        segment('system', 'preset', 'system', '系统规则'.repeat(10)),
        segment('current-user-input', 'user', 'user', '当前输入'),
      ],
      contextLength: 10,
      maxResponseLength: 5,
      tokenEstimator: (content) => content.length,
    })

    expect(result.messages.at(-1)).toEqual({ role: 'user', content: '当前输入' })
    expect(result.diagnostics.overflow).toBe(true)
    expect(result.diagnostics.omittedSegments).toEqual([])
  })
})
