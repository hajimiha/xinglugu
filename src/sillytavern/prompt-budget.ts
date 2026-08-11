import type { PromptBudgetDiagnostics, PromptTraceSegment, TavernRequest } from './types'

export interface PromptBudgetInput {
  messages: TavernRequest['messages']
  segments: PromptTraceSegment[]
  contextLength: number
  maxResponseLength: number
  tokenEstimator: (content: string) => number
}

export interface PromptBudgetResult {
  messages: TavernRequest['messages']
  segments: PromptTraceSegment[]
  diagnostics: PromptBudgetDiagnostics
}

export function applyPromptBudget(input: PromptBudgetInput): PromptBudgetResult {
  const promptBudget = Math.max(0, Math.floor(input.contextLength) - Math.max(0, Math.floor(input.maxResponseLength)))
  const systemIndexes = input.messages
    .map((message, index) => message.role === 'system' ? index : -1)
    .filter((index) => index >= 0)
  const conversationIndexes = input.messages
    .map((message, index) => message.role === 'system' ? -1 : index)
    .filter((index) => index >= 0)
  const retained = new Set<number>(systemIndexes)
  let used = systemIndexes.reduce((total, index) => total + input.tokenEstimator(input.messages[index].content), 0)
  const latestIndex = conversationIndexes.at(-1)
  if (latestIndex !== undefined) {
    retained.add(latestIndex)
    used += input.tokenEstimator(input.messages[latestIndex].content)
  }
  for (let cursor = conversationIndexes.length - 2; cursor >= 0; cursor -= 1) {
    const index = conversationIndexes[cursor]
    const cost = input.tokenEstimator(input.messages[index].content)
    if (used + cost > promptBudget) continue
    retained.add(index)
    used += cost
  }

  const messages = input.messages.filter((_, index) => retained.has(index))
  const historyIndexes = conversationIndexes.slice(0, -1)
  const retainedHistory = new Set(historyIndexes.filter((index) => retained.has(index)))
  let historyCursor = 0
  const omittedSegments: string[] = []
  const segments = input.segments.map((segment) => {
    let sent = segment.sent
    const exactMessageIndex = input.messages.findIndex((message, index) => (
      message.role === segment.role
      && message.content === segment.compiled
      && index !== latestIndex
    ))
    if (segment.source === 'history') {
      const messageIndex = historyIndexes[historyCursor]
      sent = messageIndex !== undefined && retainedHistory.has(messageIndex)
      historyCursor += 1
    } else if (segment.source === 'user' && segment.identifier === 'current-user-input') {
      sent = latestIndex !== undefined && retained.has(latestIndex)
    } else if (segment.role === 'system') {
      sent = systemIndexes.some((index) => retained.has(index))
    } else if (exactMessageIndex >= 0) {
      sent = retained.has(exactMessageIndex)
    } else {
      sent = false
    }
    if (!sent && segment.identifier) omittedSegments.push(segment.identifier)
    return { ...segment, sent }
  })
  const diagnostics: PromptBudgetDiagnostics = {
    promptBudget,
    promptTokens: used,
    reservedResponseTokens: Math.max(0, Math.floor(input.maxResponseLength)),
    omittedSegments,
    overflow: used > promptBudget,
  }
  return { messages, segments, diagnostics }
}
