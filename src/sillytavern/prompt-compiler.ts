import { createLorebookEngine } from './lorebook-engine'
import { getPresetPromptDefinitions, getPresetPromptOrder, normalizePresetPromptRole } from './preset-compat'
import type {
  ChatPreset,
  ChatSession,
  Lorebook,
  MatchedEntry,
  PromptCompilation,
  PromptTraceSegment,
  TavernMessageRole,
  TavernSettings,
} from './types'
import { formatVariablesForPrompt } from './variables'

export interface PromptCompileInput {
  userInput: string
  history: ChatSession['messages']
  preset: ChatPreset
  lorebooks: Lorebook[]
  userName: string
  characterName: string
  variables?: Record<string, string | number>
  extraVariables?: Record<string, unknown>
  formatPrompt?: string
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(Array.from(content).reduce(
    (total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 0.25 : 1),
    0,
  )))
}

function replaceBasicMacros(
  template: string,
  context: Pick<PromptCompileInput, 'userInput' | 'userName' | 'characterName' | 'variables'>,
): string {
  let result = template
    .replace(/\{\{user\}\}/gi, context.userName)
    .replace(/\{\{char\}\}/gi, context.characterName)
    .replace(/\{\{original\}\}/gi, context.userInput)
  result = result.replace(/\{\{([^{}]+)\}\}/g, (match, key: string) => {
    const value = context.variables?.[key.trim()]
    return value === undefined ? match : String(value)
  })
  return result
}

function traceSegment(
  segment: Omit<PromptTraceSegment, 'id' | 'tokenEstimate' | 'diagnostics'> & Partial<Pick<PromptTraceSegment, 'diagnostics'>>,
): PromptTraceSegment {
  return {
    ...segment,
    id: crypto.randomUUID(),
    tokenEstimate: estimateTokens(segment.compiled),
    diagnostics: segment.diagnostics ?? [],
  }
}

export function resolveSessionPreset(
  session: Pick<ChatSession, 'presetId' | 'presetBinding'>,
  settings: Pick<TavernSettings, 'activePresetId'>,
  presets: ChatPreset[],
): ChatPreset {
  const binding = session.presetBinding
  if (binding?.mode === 'pinned') {
    const pinned = presets.find((preset) => preset.id === binding.presetId)
    if (pinned) return pinned
  }
  const active = presets.find((preset) => preset.id === settings.activePresetId)
  if (active) return active
  const legacyFallback = presets.find((preset) => preset.id === session.presetId)
  if (legacyFallback) return legacyFallback
  if (presets[0]) return presets[0]
  throw new Error('尚未选择可用的酒馆提示词预设。')
}

export function compileTavernTurn(input: PromptCompileInput): PromptCompilation {
  const { preset, variables = {}, extraVariables = {} } = input
  const allMatchedEntries: MatchedEntry[] = []
  const variableScanText = [...Object.values(variables), ...Object.values(extraVariables)]
    .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
    .map(String)
    .join(' ')
  const scanText = `${input.userInput} ${input.history.slice(-3).map((message) => message.content).join(' ')} ${variableScanText}`
  for (const lorebook of input.lorebooks) {
    allMatchedEntries.push(...createLorebookEngine(lorebook).recursiveScan(scanText, 3))
  }
  const matchedEntries = Array.from(new Map(allMatchedEntries.map((match) => [match.entry.id, match])).values())
    .sort((left, right) => left.score - right.score)

  const configuredContext = preset.settings.openai_max_context ?? preset.settings.max_length
  const parsedContext = typeof configuredContext === 'number' ? configuredContext : Number(configuredContext)
  const maxContextTokens = Number.isFinite(parsedContext) && parsedContext > 0 ? parsedContext : 4096
  let usedHistoryTokens = 0
  const recentHistory: Array<{ id: string; role: TavernMessageRole; content: string }> = []
  for (let index = input.history.length - 1; index >= 0; index -= 1) {
    const message = input.history[index]
    if (message.role === 'system') continue
    const tokens = estimateTokens(message.content)
    if (usedHistoryTokens + tokens > maxContextTokens * 0.8) break
    recentHistory.unshift({ id: message.id, role: message.role, content: message.content })
    usedHistoryTokens += tokens
  }

  const definitions = getPresetPromptDefinitions(preset.settings)
  const order = getPresetPromptOrder(preset.settings).items
  const messages: PromptCompilation['messages'] = []
  const segments: PromptTraceSegment[] = []
  const diagnostics: string[] = []
  let systemAccumulator = ''
  let hasHistoryMarker = false

  const flushSystem = () => {
    if (!systemAccumulator) return
    messages.push({ role: 'system', content: systemAccumulator })
    systemAccumulator = ''
  }

  const resolveContent = (identifier: string): { content: string | null; source: PromptTraceSegment['source'] } => {
    const setting = (key: string) => {
      const value = preset.settings[key]
      return typeof value === 'string' && value.trim() ? value : null
    }
    if (identifier === 'worldInfoBefore' || identifier === 'worldInfoAfter') {
      const content = matchedEntries.map((match) => match.entry.content).join('\n\n')
      return { content: content || null, source: 'lorebook' }
    }
    const settingKeys: Record<string, string> = {
      charDescription: 'character_description',
      charPersonality: 'character_personality',
      scenario: 'scenario',
      personaDescription: 'persona_description',
      dialogueExamples: 'dialogue_examples',
      groupNudge: 'group_nudge_prompt',
      impersonate: 'impersonation_prompt',
      quietPrompt: 'quiet_prompt',
    }
    if (identifier === 'bias') return { content: null, source: 'preset' }
    if (settingKeys[identifier]) {
      return {
        content: setting(settingKeys[identifier]),
        source: identifier.startsWith('char') || identifier === 'scenario' || identifier === 'dialogueExamples'
          ? 'character'
          : 'preset',
      }
    }
    const definition = definitions.find((prompt) => prompt.identifier === identifier)
    return { content: definition?.content || setting(identifier), source: 'preset' }
  }

  for (const item of order) {
    if (item.enabled === false) continue
    if (item.identifier === 'chatHistory') {
      hasHistoryMarker = true
      flushSystem()
      for (const historyMessage of recentHistory) {
        messages.push({ role: historyMessage.role, content: historyMessage.content })
        segments.push(traceSegment({
          source: 'history',
          identifier: historyMessage.id,
          role: historyMessage.role,
          raw: historyMessage.content,
          compiled: historyMessage.content,
          sent: true,
        }))
      }
      continue
    }
    const resolved = resolveContent(item.identifier)
    if (!resolved.content) continue
    const compiled = replaceBasicMacros(resolved.content, input)
    if (!compiled.trim()) continue
    const role = normalizePresetPromptRole(item.role)
      || definitions.find((prompt) => prompt.identifier === item.identifier)?.role
      || 'system'
    segments.push(traceSegment({
      source: resolved.source,
      identifier: item.identifier,
      role,
      raw: resolved.content,
      compiled,
      sent: true,
    }))
    if (role === 'system') {
      systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${compiled}`
    } else {
      flushSystem()
      messages.push({ role, content: compiled })
    }
  }

  const variablesBlock = formatVariablesForPrompt(variables)
  if (variablesBlock) {
    segments.push(traceSegment({ source: 'variables', identifier: 'session-variables', role: 'system', raw: variablesBlock, compiled: variablesBlock, sent: true }))
    systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${variablesBlock}`
  }
  const primitiveExtraVariables = Object.fromEntries(
    Object.entries(extraVariables).filter((entry): entry is [string, string | number] => (
      typeof entry[1] === 'string' || typeof entry[1] === 'number'
    )),
  )
  const extraBlock = formatVariablesForPrompt(primitiveExtraVariables)
  if (extraBlock) {
    segments.push(traceSegment({ source: 'variables', identifier: 'runtime-variables', role: 'system', raw: extraBlock, compiled: extraBlock, sent: true }))
    systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${extraBlock}`
  }
  if (input.formatPrompt?.trim()) {
    segments.push(traceSegment({ source: 'format', identifier: 'response-contract', role: 'system', raw: input.formatPrompt, compiled: input.formatPrompt, sent: true }))
    systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${input.formatPrompt}`
  }
  flushSystem()

  if (!hasHistoryMarker) {
    for (const historyMessage of recentHistory) {
      messages.push({ role: historyMessage.role, content: historyMessage.content })
      segments.push(traceSegment({ source: 'history', identifier: historyMessage.id, role: historyMessage.role, raw: historyMessage.content, compiled: historyMessage.content, sent: true }))
    }
  }
  const userInput = replaceBasicMacros(input.userInput, input)
  messages.push({ role: 'user', content: userInput })
  segments.push(traceSegment({ source: 'user', identifier: 'current-user-input', role: 'user', raw: input.userInput, compiled: userInput, sent: true }))

  return {
    messages,
    segments,
    matchedEntries,
    macroVariables: { ...extraVariables, ...variables },
    diagnostics,
    systemPrompt: messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n'),
  }
}
