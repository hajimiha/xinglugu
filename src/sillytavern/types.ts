export type TavernTask = 'story' | 'summary' | 'vars'
export type TavernMessageRole = 'system' | 'user' | 'assistant'

export interface TavernRequest {
  task: TavernTask
  messages: Array<{ role: TavernMessageRole; content: string }>
  context?: Record<string, unknown>
}

export interface TavernPreparedRequest {
  id: string
  request: TavernRequest
  status: 'preview'
  createdAt: number
}

export interface TavernProviderRequestInspection {
  url: string
  method: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

export type TavernStreamEvent =
  | { type: 'content-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'done' }

export interface TavernApiAdapter {
  readonly mode: 'disabled' | 'remote'
  readonly label: string
  prepare(request: TavernRequest): TavernPreparedRequest
  inspect(request: TavernPreparedRequest): TavernProviderRequestInspection
  stream(request: TavernPreparedRequest, signal?: AbortSignal): AsyncIterable<TavernStreamEvent>
  getPromptBudget?: () => { contextLength: number; maxResponseLength: number }
}

export interface TavernRequestAudit {
  id: string
  createdAt: number
  status: 'succeeded' | 'failed'
  sessionId: string
  characterName: string
  presetId: string
  presetName: string
  presetBinding: 'follow-active' | 'pinned'
  provider: TavernApiProvider
  model: string
  preparedRequest: TavernRequest
  providerRequest: TavernProviderRequestInspection
  segments: PromptTraceSegment[]
  macroOperations: MacroOperation[]
  matchedLorebookEntries: string[]
  diagnostics: string[]
  providerReasoning?: string
  responsePreview?: string
  error?: string
}

export interface LorebookEntry {
  id: string
  disabled?: boolean
  excluded?: boolean
  keys: string[]
  secondaryKeys: string[]
  content: string
  comment?: string
  order: number
  position:
    | 'before_char'
    | 'after_char'
    | 'before_example'
    | 'after_example'
    | 'at_depth'
    | 'example_msg_top'
    | 'example_msg_bottom'
    | 'outlet'
  depth?: number
  role?: number
  selective: boolean
  selectiveLogic: 'and_any' | 'not_all' | 'not_any' | 'and_all'
  constant: boolean
  probability: number
  useProbability?: boolean
  addMemo: boolean
  sticky?: number
  cooldown?: number
  delay?: number
  weight?: number
  scanDepth?: number
  caseSensitive?: boolean
  matchWholeWords?: boolean
  excludeRecursion?: boolean
  preventRecursion?: boolean
  useGroupScoring?: boolean
  matchPersonaDescription?: boolean
  matchCharacterDescription?: boolean
  matchCharacterPersonality?: boolean
  matchCharacterDepthPrompt?: boolean
  matchScenario?: boolean
  matchCreatorNotes?: boolean
  group?: string
  decorators?: string[]
  characterFilter?: {
    isExclude?: boolean
    names?: string[]
    tags?: number[]
  }
}

export interface Lorebook {
  id: string
  name: string
  description?: string
  entries: LorebookEntry[]
  recursiveScanning: boolean
  caseSensitive: boolean
  matchWholeWords: boolean
  createdAt: number
  updatedAt: number
}

export interface LorebookRecursionContext {
  depth: number
  isRecursion: boolean
  seen: ReadonlySet<string>
}

export interface LorebookMatchOptions {
  random?: () => number
  recursion?: LorebookRecursionContext
}

export interface SillyTavernLorebookExport {
  name: string
  description?: string
  entries: Record<string, {
    uid: number
    key: string[]
    keysecondary: string[]
    comment: string
    content: string
    constant: boolean
    selective: boolean
    selectiveLogic: 0 | 1 | 2 | 3
    addMemo: boolean
    order: number
    position: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7
    role: number
    disable: boolean
    probability: number
    depth: number
    group: string
    useProbability: boolean
    excluded: boolean
    sticky: number
    cooldown: number
    delay: number
    weight: number
    scanDepth: number
    caseSensitive: boolean
    matchWholeWords: boolean
    excludeRecursion: boolean
    preventRecursion: boolean
    useGroupScoring: boolean
    matchPersonaDescription: boolean
    matchCharacterDescription: boolean
    matchCharacterPersonality: boolean
    matchCharacterDepthPrompt: boolean
    matchScenario: boolean
    matchCreatorNotes: boolean
    decorators: string[]
    characterFilter: {
      isExclude?: boolean
      names?: string[]
      tags?: number[]
    }
  }>
  settings?: {
    recursive_scanning?: boolean
    case_sensitive?: boolean
    match_whole_words?: boolean
  }
}

export interface MatchedEntry {
  entry: LorebookEntry
  score: number
  matchedKeywords: string[]
  identity: string
  lorebookId: string
  entryId: string
  depth: number
  position: LorebookEntry['position']
  effectiveDepth?: number
}

export interface ChatPreset {
  id: string
  name: string
  description?: string
  settings: Record<string, unknown>
  createdAt: number
  updatedAt: number
}

export interface ParsedTags {
  thinking: string
  maintext: string
  options: string[]
  sum: string
  varsRaw: string
  varsCommands: VarsPatch
  unknown: Record<string, string>
}

export interface VarsPatch {
  merge: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: TavernMessageRole
  content: string
  timestamp: number
  variables?: Record<string, string | number>
  metadata?: {
    tokenCount?: number
    lorebookEntries?: string[]
    processingTime?: number
    providerReasoning?: string
  }
  parsed?: ParsedTags
  variablesAfter?: Record<string, unknown>
  apiUsed?: 'local' | 'remote'
}

export interface ChatSession {
  id: string
  name: string
  messages: ChatMessage[]
  characterId?: string
  npcId?: string
  branchFromSessionId?: string
  characterName: string
  userName: string
  presetId: string | null
  presetBinding?: PresetBinding
  lorebookIds: string[]
  variables: Record<string, unknown>
  variableDefinitions?: TavernVariableDefinition[]
  createdAt: number
  updatedAt: number
}

export type PresetBinding =
  | { mode: 'follow-active' }
  | { mode: 'pinned'; presetId: string }

export type PromptTraceSource = 'preset' | 'character' | 'lorebook' | 'history' | 'variables' | 'format' | 'regex' | 'user'

export interface PromptTraceSegment {
  id: string
  source: PromptTraceSource
  identifier?: string
  role: TavernMessageRole
  raw: string
  compiled: string
  sent: boolean
  tokenEstimate: number
  diagnostics: string[]
}

export type MacroOperationType = 'set' | 'add' | 'read' | 'random' | 'roll' | 'trim' | 'comment'

export interface MacroOperation {
  type: MacroOperationType
  macro: string
  key?: string
  value?: unknown
}

export interface PromptCompilation {
  messages: TavernRequest['messages']
  segments: PromptTraceSegment[]
  matchedEntries: MatchedEntry[]
  macroVariables: Record<string, unknown>
  macroOperations: MacroOperation[]
  diagnostics: string[]
  systemPrompt: string
  budgetDiagnostics?: PromptBudgetDiagnostics
}

export interface PromptBudgetDiagnostics {
  promptBudget: number
  promptTokens: number
  reservedResponseTokens: number
  omittedSegments: string[]
  overflow: boolean
}

export interface CharacterCard {
  id: string
  npcId: string
  name: string
  role: string
  locationId: string
  description: string
  personality: string
  scenario: string
  firstMessage: string
  exampleDialogue: string
  lorebookIds: string[]
  portraitSlots: PortraitSlot[]
  tags: string[]
  createdAt: number
  updatedAt: number
}

export type CharacterPromptIdentifier =
  | 'character_description'
  | 'character_personality'
  | 'scenario'
  | 'dialogue_examples'

export interface PortraitSlot {
  id: string
  minAffinity: number
  maxAffinity: number
  source: string
}

export interface MistvaleTavernDefaults {
  lorebooks: Lorebook[]
  presets: ChatPreset[]
  characters: CharacterCard[]
  sessions: ChatSession[]
  settings: TavernSettings
}

export type TavernApiProvider =
  | 'azure-openai'
  | 'chutes'
  | 'claude'
  | 'cloudflare-workers-ai'
  | 'cohere'
  | 'deepseek'
  | 'electron-hub'
  | 'fireworks'
  | 'groq'
  | 'google-ai-studio'
  | 'google-vertex-ai'
  | 'mistral'
  | 'minimax'
  | 'moonshot'
  | 'nanogpt'
  | 'openai'
  | 'openrouter'
  | 'perplexity'
  | 'pollinations'
  | 'siliconflow'
  | 'xai'
  | 'zai'
  | 'openai-compatible'

export type TavernApiProtocol =
  | 'openai-chat'
  | 'azure-openai'
  | 'anthropic-messages'
  | 'gemini'
  | 'vertex-gemini'
  | 'cohere-v2'
  | 'cloudflare-workers-ai'

export type TavernApiAuth = 'bearer' | 'api-key' | 'x-api-key' | 'google-api-key'
export type TavernProviderOptionKey = 'accountId' | 'projectId' | 'location'

export interface TavernApiConfig {
  provider: TavernApiProvider
  baseUrl: string
  model: string
  contextLength: number
  maxResponseLength: number
  streaming: boolean
  temperature: number
  frequencyPenalty: number
  presencePenalty: number
  topP: number
  rememberKey: boolean
  providerOptions: Partial<Record<TavernProviderOptionKey, string>>
  persistedApiKey?: string
}

export interface TavernSettings {
  key: 'mistvale-settings'
  api: TavernApiConfig
  activePresetId: string | null
  activeLorebookIds: string[]
  activeCharacterId: string | null
  activeSessionId: string | null
  userName: string
  customTags: string[]
  formatPromptTemplate: string
  thinkingDisplay: 'fold' | 'hide' | 'inline'
  globalVariables: TavernVariableDefinition[]
  regexScripts: TavernRegexScript[]
  contentPackVersion?: string
  defaultContentVersion?: number
  updatedAt: number
}

export type TavernVariableType = 'string' | 'number' | 'boolean'
export type TavernVariableScope = 'global' | 'session'

export interface TavernVariableDefinition {
  key: string
  label: string
  type: TavernVariableType
  value: string | number | boolean
  scope: TavernVariableScope
  min?: number
  max?: number
  description?: string
}

export type TavernRegexStage = 'prompt' | 'output' | 'display'
export type TavernRegexTarget = 'user' | 'assistant'
export type TavernRegexScope = 'global' | 'preset'

export interface TavernRegexScript {
  id: string
  name: string
  enabled: boolean
  pattern: string
  replacement: string
  trimStrings: string[]
  stages: TavernRegexStage[]
  targets: TavernRegexTarget[]
  minDepth?: number
  maxDepth?: number
  scope: TavernRegexScope
  order: number
}

export interface TavernRegexMatch {
  scriptId: string
  scriptName: string
  count: number
  before: string
  after: string
}

export interface TavernRegexError {
  scriptId: string
  scriptName: string
  message: string
}

export const DEFAULT_FORMAT_PROMPT = `模型必须使用以下六段式酒馆结构：
<thinking>内部状态推演</thinking>
<maintext>本回合剧情正文</maintext>
<option>可选择的行动，每行一项</option>
<sum>本回合摘要</sum>
<vars>{ "金币": 1880, "精力": 4 }</vars>`

export const DEFAULT_TAGS = ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'] as const
export const DEFAULT_OPAQUE_TAGS = ['thinking', 'think'] as const

export const DEFAULT_PROMPT_ORDER = [
  { identifier: 'main', name: '主叙事规则', role: 'system' as const },
  { identifier: 'worldInfoBefore', name: '世界书·前置', role: 'system' as const },
  { identifier: 'charDescription', name: '角色描述', role: 'system' as const },
  { identifier: 'charPersonality', name: '角色性格', role: 'system' as const },
  { identifier: 'scenario', name: '当前场景', role: 'system' as const },
  { identifier: 'personaDescription', name: '玩家设定', role: 'system' as const },
  { identifier: 'dialogueExamples', name: '对话示例', role: 'system' as const },
  { identifier: 'chatHistory', name: '会话历史', role: 'system' as const },
  { identifier: 'worldInfoAfter', name: '世界书·后置', role: 'system' as const },
  { identifier: 'groupNudge', name: '群组提示', role: 'system' as const },
]

export function createDefaultPreset(): Omit<ChatPreset, 'id' | 'createdAt' | 'updatedAt'> {
  return {
    name: '雾灯叙事预设',
    description: '面向模型 API 的 SillyTavern 风格中文叙事结构，组合角色卡、世界书与游戏变量。',
    settings: {
      max_length: 4096,
      main: '以精细、克制的中文描写推进 {{char}} 与 {{user}} 在雾灯谷的互动。',
      character_description: '',
      character_personality: '',
      scenario: '',
      persona_description: '',
      dialogue_examples: '',
      group_nudge_prompt: '',
      prompts: [],
      prompt_order: DEFAULT_PROMPT_ORDER.map((item) => ({ ...item, enabled: true })),
    },
  }
}

export const GAME_VARIABLE_LABELS = {
  money: '金币',
  energy: '精力',
  affinity: '好感',
} as const
