import type { CharacterCard, ChatSession, Lorebook, TavernApiAdapter } from '../types'
import type { ImageGenerationSettings } from './types'
import { parseStructuredImagePrompt, type StructuredImagePrompt } from './prompt'

export interface ImagePromptContextInput {
  session: ChatSession
  character: CharacterCard
  lorebooks: Lorebook[]
  settings: ImageGenerationSettings
  instruction?: string
  sourceText?: string
  variables?: Record<string, unknown>
}

function clip(value: string, maximum: number): string {
  return value.trim().slice(0, maximum)
}

export function buildImagePromptContext(input: ImagePromptContextInput): string {
  const history = input.session.messages
    .slice(-Math.max(0, input.settings.prompt.historyDepth))
    .map((message) => `${message.role === 'assistant' ? input.character.name : input.session.userName}：${clip(message.content, 1800)}`)
    .join('\n')
  const lore = input.lorebooks
    .flatMap((book) => book.entries.filter((entry) => !entry.disabled && !entry.excluded).map((entry) => entry.content))
    .join('\n')
    .slice(0, 12000)
  const safeVariables = Object.entries(input.variables ?? input.session.variables)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
    .slice(0, 40)
    .map(([key, value]) => `${key}=${String(value).slice(0, 300)}`)
    .join('；')
  return [
    `角色：${input.character.name}（${input.character.role}）`,
    `人物设定：${clip([input.character.description, input.character.personality, input.character.scenario].filter(Boolean).join('\n'), 6000)}`,
    safeVariables ? `场景变量：${safeVariables}` : '',
    lore ? `世界资料：\n${lore}` : '',
    history ? `最近对话：\n${history}` : '',
    input.sourceText?.trim() ? `触发内容：\n${clip(input.sourceText, 4000)}` : '',
    input.instruction?.trim() ? `玩家补充要求：\n${clip(input.instruction, 2000)}` : '',
  ].filter(Boolean).join('\n\n')
}

export async function generateStructuredImagePrompt(
  api: TavernApiAdapter,
  input: ImagePromptContextInput,
  signal?: AbortSignal,
): Promise<StructuredImagePrompt> {
  const prepared = api.prepare({
    task: 'image-prompt',
    messages: [
      { role: 'system', content: input.settings.prompt.systemTemplate },
      { role: 'user', content: buildImagePromptContext(input) },
    ],
  })
  let raw = ''
  for await (const event of api.stream(prepared, signal)) {
    if (event.type === 'content-delta') raw += event.text
  }
  if (!raw.trim()) throw new Error('提示词模型没有返回可用内容。')
  return parseStructuredImagePrompt(raw)
}
