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
  const omittedSegments: string[] = []
  const segments = input.segments.map((segment) => {
    const sent = segment.messageIndex !== null && retained.has(segment.messageIndex)
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
