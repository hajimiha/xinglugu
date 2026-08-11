import { createLorebookEngine } from './lorebook-engine'
import { evaluateMacros } from './macro-engine'
import { applyRegexScripts, getPresetRegexScripts } from './regex-engine'
import { getPresetPromptDefinitions, getPresetPromptOrder, normalizePresetPromptRole } from './preset-compat'
import { projectCharacterPrompts } from './rolecard-projection'
import type {
  CharacterCard,
  ChatPreset,
  ChatSession,
  Lorebook,
  MacroOperation,
  MatchedEntry,
  PromptCompilation,
  PromptTraceSegment,
  TavernMessageRole,
  TavernSettings,
  TavernRegexScript,
} from './types'
import { formatVariablesForPrompt } from './variables'
import { applyPromptBudget } from './prompt-budget'

export interface PromptCompileInput {
  userInput: string
  history: ChatSession['messages']
  preset: ChatPreset
  lorebooks: Lorebook[]
  userName: string
  characterName: string
  character?: CharacterCard
  variables?: Record<string, string | number>
  extraVariables?: Record<string, unknown>
  formatPrompt?: string
  regexScripts?: TavernRegexScript[]
  budget?: { contextLength: number; maxResponseLength: number }
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(Array.from(content).reduce(
    (total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 0.25 : 1),
    0,
  )))
}

function resolvePromptBudget(input: PromptCompileInput): { contextLength: number; maxResponseLength: number } {
  if (input.budget) return input.budget
  const configuredContext = input.preset.settings.openai_max_context ?? input.preset.settings.max_length
  const parsedContext = typeof configuredContext === 'number' ? configuredContext : Number(configuredContext)
  const configuredResponse = input.preset.settings.maxResponseLength ?? input.preset.settings.max_tokens
  const parsedResponse = typeof configuredResponse === 'number' ? configuredResponse : Number(configuredResponse)
  return {
    contextLength: Number.isFinite(parsedContext) && parsedContext > 0 ? parsedContext : 4096,
    maxResponseLength: Number.isFinite(parsedResponse) && parsedResponse > 0 ? parsedResponse : 0,
  }
}

function traceSegment(
  segment: Omit<PromptTraceSegment, 'id' | 'tokenEstimate' | 'diagnostics' | 'messageIndex'> & Partial<Pick<PromptTraceSegment, 'diagnostics' | 'messageIndex'>>,
): PromptTraceSegment {
  return {
    ...segment,
    id: crypto.randomUUID(),
    messageIndex: segment.messageIndex ?? null,
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
  const scanText = `${input.characterName} ${input.userInput} ${input.history.slice(-3).map((message) => message.content).join(' ')} ${variableScanText}`
  for (const lorebook of input.lorebooks) {
    allMatchedEntries.push(...createLorebookEngine(lorebook).recursiveScan(scanText, 3))
  }
  const matchedEntries = Array.from(new Map(allMatchedEntries.map((match) => [match.identity, match])).values())
    .sort((left, right) => left.score - right.score || left.identity.localeCompare(right.identity))

  const recentHistory = input.history.filter((message) => message.role !== 'system')

  const definitions = getPresetPromptDefinitions(preset.settings)
  const order = getPresetPromptOrder(preset.settings).items
  const messages: PromptCompilation['messages'] = []
  const segments: PromptTraceSegment[] = []
  const unsupportedPositions = Array.from(new Set(matchedEntries
    .map((match) => match.position)
    .filter((position) => !['before_char', 'after_char', 'before_example', 'after_example'].includes(position))))
  const diagnostics: string[] = unsupportedPositions.map((position) => `未支持的世界书注入位置：${position}`)
  const macroOperations: MacroOperation[] = []
  let macroVariables: Record<string, unknown> = { ...extraVariables, ...variables }
  const macroContext = {
    userName: input.userName,
    characterName: input.characterName,
    original: input.userInput,
    lastUserMessage: [...input.history].reverse().find((message) => message.role === 'user')?.content ?? '',
    lastCharacterMessage: [...input.history].reverse().find((message) => message.role === 'assistant')?.content ?? '',
  }
  const characterPrompts = input.character ? projectCharacterPrompts(input.character) : undefined
  const regexScripts = [...(input.regexScripts ?? []), ...getPresetRegexScripts(preset.settings)]
  const compileMacros = (raw: string) => {
    const evaluation = evaluateMacros(raw, macroVariables, macroContext)
    macroVariables = evaluation.variables
    macroOperations.push(...evaluation.operations)
    diagnostics.push(...evaluation.diagnostics)
    diagnostics.push(...evaluation.unknownMacros.map((macro) => `未识别宏已原样保留：${macro}`))
    return evaluation
  }
  const applyPromptRegex = (raw: string, target: 'user' | 'assistant', depth: number) => {
    const result = applyRegexScripts(raw, regexScripts, {
      stage: 'prompt', target, depth, macroContext, variables: macroVariables,
    })
    macroVariables = result.variables
    diagnostics.push(...result.errors.map((error) => `正则“${error.scriptName}”执行失败：${error.message}`))
    diagnostics.push(...result.matches.map((match) => `正则“${match.scriptName}”命中 ${match.count} 次。`))
    return result
  }
  let systemAccumulator = ''
  let hasHistoryMarker = false
  const pendingSystemSegmentIndexes: number[] = []

  const flushSystem = () => {
    if (!systemAccumulator) return
    const messageIndex = messages.length
    messages.push({ role: 'system', content: systemAccumulator })
    for (const segmentIndex of pendingSystemSegmentIndexes) {
      segments[segmentIndex] = { ...segments[segmentIndex], messageIndex }
    }
    pendingSystemSegmentIndexes.length = 0
    systemAccumulator = ''
  }

  const resolveContent = (identifier: string): { content: string | null; source: PromptTraceSegment['source'] } => {
    const setting = (key: string) => {
      const value = preset.settings[key]
      return typeof value === 'string' && value.trim() ? value : null
    }
    const placementByIdentifier: Record<string, MatchedEntry['position']> = {
      worldInfoBefore: 'before_char',
      worldInfoAfter: 'after_char',
      worldInfoBeforeExamples: 'before_example',
      worldInfoAfterExamples: 'after_example',
    }
    if (placementByIdentifier[identifier]) {
      const content = matchedEntries
        .filter((match) => match.position === placementByIdentifier[identifier])
        .map((match) => match.entry.content)
        .join('\n\n')
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
      const promptKey = settingKeys[identifier]
      const characterPrompt = characterPrompts && promptKey in characterPrompts
        ? characterPrompts[promptKey as keyof typeof characterPrompts]
        : undefined
      return {
        content: characterPrompt?.trim() ? characterPrompt : setting(promptKey),
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
      for (const [historyIndex, historyMessage] of recentHistory.entries()) {
        const regexResult = applyPromptRegex(historyMessage.content, historyMessage.role === 'user' ? 'user' : 'assistant', recentHistory.length - historyIndex)
        const messageIndex = messages.length
        messages.push({ role: historyMessage.role, content: regexResult.text })
        segments.push({ ...traceSegment({
          source: 'history',
          identifier: historyMessage.id,
          role: historyMessage.role,
          raw: historyMessage.content,
          compiled: regexResult.text,
          sent: true,
          diagnostics: regexResult.errors.map((error) => error.message),
        }), messageIndex })
      }
      continue
    }
    const resolved = resolveContent(item.identifier)
    if (!resolved.content) continue
    const evaluation = compileMacros(resolved.content)
    const compiled = evaluation.text
    const role = normalizePresetPromptRole(item.role)
      || definitions.find((prompt) => prompt.identifier === item.identifier)?.role
      || 'system'
    const segment = traceSegment({
      source: resolved.source,
      identifier: item.identifier,
      role,
      raw: resolved.content,
      compiled,
      sent: Boolean(compiled.trim()),
      diagnostics: [
        ...evaluation.diagnostics,
        ...evaluation.unknownMacros.map((macro) => `未识别宏已原样保留：${macro}`),
      ],
    })
    segments.push(segment)
    if (!compiled.trim()) continue
    if (role === 'system') {
      pendingSystemSegmentIndexes.push(segments.length - 1)
      systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${compiled}`
    } else {
      flushSystem()
      const messageIndex = messages.length
      messages.push({ role, content: compiled })
      segments[segments.length - 1] = { ...segment, messageIndex }
    }
  }

  const variablesBlock = formatVariablesForPrompt(variables)
  if (variablesBlock) {
    segments.push(traceSegment({ source: 'variables', identifier: 'session-variables', role: 'system', raw: variablesBlock, compiled: variablesBlock, sent: true }))
    pendingSystemSegmentIndexes.push(segments.length - 1)
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
    pendingSystemSegmentIndexes.push(segments.length - 1)
    systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${extraBlock}`
  }
  if (input.formatPrompt?.trim()) {
    const evaluation = compileMacros(input.formatPrompt)
    const segment = traceSegment({
      source: 'format',
      identifier: 'response-contract',
      role: 'system',
      raw: input.formatPrompt,
      compiled: evaluation.text,
      sent: Boolean(evaluation.text.trim()),
      diagnostics: evaluation.diagnostics,
    })
    segments.push(segment)
    if (evaluation.text.trim()) {
      pendingSystemSegmentIndexes.push(segments.length - 1)
      systemAccumulator += `${systemAccumulator ? '\n\n' : ''}${evaluation.text}`
    }
  }
  flushSystem()

  if (!hasHistoryMarker) {
    for (const [historyIndex, historyMessage] of recentHistory.entries()) {
      const regexResult = applyPromptRegex(historyMessage.content, historyMessage.role === 'user' ? 'user' : 'assistant', recentHistory.length - historyIndex)
      const messageIndex = messages.length
      messages.push({ role: historyMessage.role, content: regexResult.text })
      segments.push({ ...traceSegment({ source: 'history', identifier: historyMessage.id, role: historyMessage.role, raw: historyMessage.content, compiled: regexResult.text, sent: true, diagnostics: regexResult.errors.map((error) => error.message) }), messageIndex })
    }
  }
  const userEvaluation = compileMacros(input.userInput)
  const userRegexResult = applyPromptRegex(userEvaluation.text, 'user', 0)
  const userInput = userRegexResult.text
  const userMessageIndex = messages.length
  messages.push({ role: 'user', content: userInput })
  segments.push({ ...traceSegment({ source: 'user', identifier: 'current-user-input', role: 'user', raw: input.userInput, compiled: userInput, sent: true, diagnostics: userRegexResult.errors.map((error) => error.message) }), messageIndex: userMessageIndex })

  const compilation: PromptCompilation = {
    messages,
    segments,
    matchedEntries,
    macroVariables,
    macroOperations,
    diagnostics,
    systemPrompt: messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n'),
  }
  const budgeted = applyPromptBudget({
    messages: compilation.messages,
    segments: compilation.segments,
    ...resolvePromptBudget(input),
    tokenEstimator: estimateTokens,
  })
  return {
    ...compilation,
    messages: budgeted.messages,
    segments: budgeted.segments,
    budgetDiagnostics: budgeted.diagnostics,
    systemPrompt: budgeted.messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n'),
  }
}
