import type { CharacterCard, ChatSession, Lorebook, TavernApiAdapter } from '../types'
import type { ImageGenerationSettings } from './types'
import { parseStructuredImagePrompt, type StructuredImagePrompt } from './prompt'
import { buildImageLlmMessages } from './llm-presets'

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
  const depth = Math.max(0, input.settings.prompt.historyDepth)
  const history = (depth ? input.session.messages.slice(-depth) : [])
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
  const context = buildImagePromptContext(input)
  const prompt = input.settings.prompt
  const preset = prompt.llmPresets.find((item) => item.id === prompt.activeLlmPresetId) ?? prompt.llmPresets[0]
  const triggerText = [input.instruction, input.sourceText].filter(Boolean).join('\n')
  const substitutions: Record<string, string> = {
    '正文': clip(input.sourceText ?? '', 4000), '用户需求': clip(input.instruction ?? '', 2000),
    '上下文': context, 'user': input.session.userName, 'char': input.character.name,
    '世界书触发': input.lorebooks.flatMap((book) => book.entries.filter((entry) => !entry.disabled && !entry.excluded).map((entry) => entry.content)).join('\n').slice(0, 12000),
  }
  const variables = input.variables ?? input.session.variables
  const messages = buildImageLlmMessages(preset, triggerText).map((message) => ({ ...message,
    content: message.content.replace(/\{\{([^{}]+)\}\}/g, (placeholder, name: string) => {
      if (Object.hasOwn(substitutions, name)) return substitutions[name]
      if (name.startsWith('getvar::')) {
        const key = name.slice(8)
        const value = Object.hasOwn(variables, key) ? variables[key] : undefined
        return ['string', 'number', 'boolean'].includes(typeof value) ? String(value).slice(0, 2000) : ''
      }
      return placeholder // Unsupported host macros remain text, never executable code.
    }),
  }))
  const firstConversation = messages.findIndex((message) => message.role !== 'system')
  messages.splice(firstConversation < 0 ? messages.length : firstConversation, 0, {
    role: 'system', content: '将最终绘图提示词作为 <image_prompt><title>简短中文标题</title><positive>正面提示词</positive><negative>负面提示词</negative></image_prompt> 输出，不要解释。',
  })
  const prepared = api.prepare({
    task: 'image-prompt',
    messages: [
      ...messages,
      { role: 'user', content: context },
    ],
  })
  let raw = ''
  for await (const event of api.stream(prepared, signal)) {
    if (event.type === 'content-delta') raw += event.text
  }
  if (!raw.trim()) throw new Error('提示词模型没有返回可用内容。')
  return parseStructuredImagePrompt(raw)
}
