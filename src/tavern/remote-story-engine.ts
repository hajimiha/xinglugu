import { assemblePrompt } from '../sillytavern/prompt-assembler'
import { StreamTagParser, type ParserEvent } from '../sillytavern/stream-parser'
import {
  DEFAULT_OPAQUE_TAGS,
  DEFAULT_TAGS,
  type CharacterCard,
  type ChatMessage,
  type ChatPreset,
  type Lorebook,
  type ParsedTags,
  type TavernApiAdapter,
} from '../sillytavern/types'
import { aggregateEvents, applyParsedToChat } from '../sillytavern/variables'
import { applyRegexScripts, getPresetRegexScripts } from '../sillytavern/regex-engine'
import type { TavernRegexScript } from '../sillytavern/types'

export interface RemoteTurnInput {
  api: TavernApiAdapter
  playerText: string
  history: ChatMessage[]
  preset: ChatPreset
  lorebooks: Lorebook[]
  character: CharacterCard
  userName: string
  variables: Record<string, unknown>
  formatPrompt: string
  regexScripts?: TavernRegexScript[]
  signal?: AbortSignal
  onDelta?: (raw: string) => void
  onReasoningDelta?: (reasoning: string) => void
}

export interface RemoteTurnResult {
  raw: string
  parsed: ParsedTags
  variablesAfter: Record<string, unknown>
  matchedEntryIds: string[]
  regexErrors: string[]
  providerReasoning: string
}

const REMOTE_RESPONSE_CONTRACT = `请只输出以下酒馆标签结构，不要使用 Markdown 代码块：
<thinking>简短的内部状态，可省略</thinking>
<maintext>NPC 本回合对玩家说的话与必要的场景描写</maintext>
<option>给玩家的下一步行动，每行一项，提供 2 到 4 项</option>
<sum>一句话记录本回合发生的事</sum>
<vars>{"需要更新的变量":"新值"}</vars>
正文必须使用简体中文；不要替玩家做出未选择的决定；变量没有变化时输出空对象。`

function hydratePreset(preset: ChatPreset, character: CharacterCard): ChatPreset {
  return {
    ...preset,
    settings: {
      ...preset.settings,
      character_description: `${character.name}是${character.role}。${character.description}`,
      character_personality: character.personality,
      scenario: character.scenario,
      dialogue_examples: character.exampleDialogue,
    },
  }
}

function parseResponse(raw: string): ParsedTags {
  const parser = new StreamTagParser([...DEFAULT_TAGS], [...DEFAULT_OPAQUE_TAGS])
  const events: ParserEvent[] = []
  for (let cursor = 0; cursor < raw.length; cursor += 64) {
    events.push(...parser.feed(raw.slice(cursor, cursor + 64)))
  }
  events.push(...parser.finish())
  const parsed = aggregateEvents(events)
  parsed.options = parsed.options.map((option) => option.trim()).filter(Boolean)
  parsed.maintext = parsed.maintext.trim() || raw.trim()
  parsed.sum = parsed.sum.trim()
  return parsed
}

export async function createRemoteTurn(input: RemoteTurnInput): Promise<RemoteTurnResult> {
  if (input.api.mode !== 'remote') throw new Error('当前适配器不是远程模型接口。')
  const primitiveVariables = Object.fromEntries(
    Object.entries(input.variables).filter((entry): entry is [string, string | number] => (
      typeof entry[1] === 'string' || typeof entry[1] === 'number'
    )),
  )
  const assembled = assemblePrompt({
    userInput: input.playerText,
    history: input.history,
    preset: hydratePreset(input.preset, input.character),
    lorebooks: input.lorebooks,
    userName: input.userName,
    characterName: input.character.name,
    variables: primitiveVariables,
    extraVariables: input.variables,
    formatPrompt: `${input.formatPrompt}\n\n${REMOTE_RESPONSE_CONTRACT}`,
    regexScripts: input.regexScripts,
  })
  const prepared = input.api.prepare({
    task: 'story',
    messages: assembled.messages,
    context: {
      characterId: input.character.id,
      lorebookEntryIds: assembled.matchedEntries.map((match) => match.entry.id),
    },
  })
  let raw = ''
  let providerReasoning = ''
  for await (const event of input.api.stream(prepared, input.signal)) {
    if (event.type === 'content-delta') {
      raw += event.text
      input.onDelta?.(raw)
    } else if (event.type === 'reasoning-delta') {
      providerReasoning += event.text
      input.onReasoningDelta?.(providerReasoning)
    }
  }
  if (!raw.trim()) {
    throw new Error(providerReasoning.trim()
      ? '模型只返回了供应商推理内容，没有返回剧情正文。请检查预设的输出格式或模型设置。'
      : '模型没有返回可显示的剧情文字。')
  }

  const outputRegex = applyRegexScripts(raw, [...(input.regexScripts ?? []), ...getPresetRegexScripts(input.preset.settings)], {
    stage: 'output',
    target: 'assistant',
    depth: 0,
    macroContext: {
      userName: input.userName,
      characterName: input.character.name,
      original: input.playerText,
      lastUserMessage: [...input.history].reverse().find((message) => message.role === 'user')?.content ?? '',
      lastCharacterMessage: [...input.history].reverse().find((message) => message.role === 'assistant')?.content ?? '',
    },
    variables: assembled.macroVariables,
  })
  raw = outputRegex.text
  const parsed = parseResponse(raw)
  const { nextVariables } = applyParsedToChat(outputRegex.variables, parsed)
  return {
    raw,
    parsed,
    variablesAfter: nextVariables,
    matchedEntryIds: assembled.matchedEntries.map((match) => match.entry.id),
    regexErrors: outputRegex.errors.map((error) => `正则“${error.scriptName}”：${error.message}`),
    providerReasoning: providerReasoning.trim(),
  }
}
