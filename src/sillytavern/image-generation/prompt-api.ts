import { createRemoteTavernApi } from '../api-adapter'
import { validateTavernApiConfig } from '../api-config'
import { getTavernProvider, isTavernApiProvider } from '../provider-registry'
import type { TavernApiConfig } from '../types'
import type { ImagePromptApiSettings } from './types'
import { resolveImagePromptCredential } from './credentials'

export function normalizeImagePromptApi(value: unknown): ImagePromptApiSettings {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const provider = isTavernApiProvider(source.provider) ? source.provider : 'openai-compatible'
  const definition = getTavernProvider(provider)
  const text = (key: string, fallback = '') => typeof source[key] === 'string' ? source[key].trim() : fallback
  const numeric = (key: string, fallback: number) => typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : fallback
  const options = source.providerOptions && typeof source.providerOptions === 'object' ? source.providerOptions as Record<string, unknown> : {}
  return {
    enabled: source.enabled === true, provider,
    baseUrl: text('baseUrl', definition.baseUrl).replace(/\/+$/, ''), model: text('model', definition.defaultModel),
    streaming: source.streaming !== false, rememberKey: source.rememberKey === true,
    contextLength: numeric('contextLength', 32768), maxResponseLength: numeric('maxResponseLength', 2048),
    temperature: numeric('temperature', 0.7), frequencyPenalty: numeric('frequencyPenalty', 0), presencePenalty: numeric('presencePenalty', 0), topP: numeric('topP', provider === 'cohere' ? 0.99 : 1),
    providerOptions: Object.fromEntries(definition.requiredOptions.filter((key) => typeof options[key] === 'string').map((key) => [key, (options[key] as string).trim()])),
  }
}

export function createImagePromptApi(storyConfig: TavernApiConfig, storyKey: string, promptApi: ImagePromptApiSettings) {
  if (!promptApi.enabled) return createRemoteTavernApi(storyConfig, storyKey)
  const errors = validateTavernApiConfig(promptApi)
  if (Object.keys(errors).length) throw new Error(`绘图提示词独立接口：${Object.values(errors)[0]}`)
  const key = resolveImagePromptCredential(promptApi)
  if (!key) throw new Error('请先配置绘图提示词独立接口的密钥，或关闭独立 API 以使用正文模型。')
  return createRemoteTavernApi(promptApi, key)
}
