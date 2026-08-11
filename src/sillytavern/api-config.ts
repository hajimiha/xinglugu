import { createMistvaleDefaults } from './defaults'
import { getTavernProvider, isTavernApiProvider } from './provider-registry'
import { parseVariableDefinitions } from './variable-definitions'
import { parseRegexScripts } from './regex-engine'
import type { TavernApiConfig, TavernApiProvider, TavernProviderOptionKey, TavernSettings } from './types'

type NumericApiField = 'contextLength' | 'maxResponseLength' | 'temperature' | 'frequencyPenalty' | 'presencePenalty' | 'topP'
export type TavernApiFieldErrors = Partial<Record<'baseUrl' | 'model' | NumericApiField | TavernProviderOptionKey, string>>

export function getTavernApiPreset(provider: TavernApiProvider) {
  const definition = getTavernProvider(provider)
  return { provider, baseUrl: definition.baseUrl, model: definition.defaultModel, providerOptions: {} }
}

export function normalizeApiBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

export function validateTavernApiConfig(config: TavernApiConfig): TavernApiFieldErrors {
  const errors: TavernApiFieldErrors = {}
  const baseUrl = normalizeApiBaseUrl(config.baseUrl)
  try {
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) errors.baseUrl = '接口地址必须使用 HTTP 或 HTTPS。'
    if (parsed.username || parsed.password || parsed.search || parsed.hash) {
      errors.baseUrl = '接口地址不能包含用户名、密码、查询参数或片段。'
    }
  } catch {
    errors.baseUrl = '请输入完整的接口地址，例如 https://api.deepseek.com。'
  }
  if (!config.model.trim()) errors.model = '请填写要使用的模型名称。'
  const provider = getTavernProvider(config.provider)
  for (const option of provider.requiredOptions) {
    if (!config.providerOptions[option]?.trim()) errors[option] = `请填写${option === 'accountId' ? ' Account ID' : option === 'projectId' ? '项目 ID' : '区域'}。`
  }
  if (!Number.isFinite(config.temperature) || config.temperature < 0 || config.temperature > 2) {
    errors.temperature = '温度必须在 0 到 2 之间。'
  }
  if (!Number.isInteger(config.contextLength) || config.contextLength < 128) {
    errors.contextLength = '上下文长度必须是大于或等于 128 的整数。'
  }
  if (!Number.isInteger(config.maxResponseLength) || config.maxResponseLength < 1) {
    errors.maxResponseLength = '最大回复长度必须是大于 0 的整数。'
  } else if (Number.isInteger(config.contextLength) && config.maxResponseLength >= config.contextLength) {
    errors.maxResponseLength = '最大回复长度必须小于上下文长度，以便为提示词保留空间。'
  }
  if (!Number.isFinite(config.frequencyPenalty) || config.frequencyPenalty < -2 || config.frequencyPenalty > 2) {
    errors.frequencyPenalty = '频率惩罚必须在 -2 到 2 之间。'
  }
  if (!Number.isFinite(config.presencePenalty) || config.presencePenalty < -2 || config.presencePenalty > 2) {
    errors.presencePenalty = '存在惩罚必须在 -2 到 2 之间。'
  }
  if (!Number.isFinite(config.topP) || config.topP < 0 || config.topP > 1) {
    errors.topP = 'Top P 必须在 0 到 1 之间。'
  }
  return errors
}

export function normalizeTavernSettings(value: unknown): TavernSettings {
  const defaults = createMistvaleDefaults().settings
  if (!value || typeof value !== 'object') return defaults
  const candidate = value as Partial<TavernSettings> & {
    adapterMode?: string
    api?: Partial<TavernApiConfig> & { maxTokens?: number }
  }
  const provider: TavernApiProvider = isTavernApiProvider(candidate.api?.provider) ? candidate.api.provider : 'deepseek'
  const preset = getTavernApiPreset(provider)
  const rememberKey = candidate.api?.rememberKey === true
  const api: TavernApiConfig = {
    ...defaults.api,
    ...preset,
    ...candidate.api,
    provider,
    baseUrl: typeof candidate.api?.baseUrl === 'string' ? normalizeApiBaseUrl(candidate.api.baseUrl) : preset.baseUrl,
    model: typeof candidate.api?.model === 'string' ? candidate.api.model.trim() : preset.model,
    contextLength: typeof candidate.api?.contextLength === 'number' && Number.isFinite(candidate.api.contextLength)
      ? Math.round(candidate.api.contextLength)
      : defaults.api.contextLength,
    maxResponseLength: typeof candidate.api?.maxResponseLength === 'number' && Number.isFinite(candidate.api.maxResponseLength)
      ? Math.round(candidate.api.maxResponseLength)
      : typeof candidate.api?.maxTokens === 'number' && Number.isFinite(candidate.api.maxTokens)
        ? Math.round(candidate.api.maxTokens)
        : defaults.api.maxResponseLength,
    streaming: candidate.api?.streaming !== false,
    temperature: typeof candidate.api?.temperature === 'number' && Number.isFinite(candidate.api.temperature)
      ? candidate.api.temperature
      : defaults.api.temperature,
    frequencyPenalty: typeof candidate.api?.frequencyPenalty === 'number' && Number.isFinite(candidate.api.frequencyPenalty)
      ? candidate.api.frequencyPenalty
      : defaults.api.frequencyPenalty,
    presencePenalty: typeof candidate.api?.presencePenalty === 'number' && Number.isFinite(candidate.api.presencePenalty)
      ? candidate.api.presencePenalty
      : defaults.api.presencePenalty,
    topP: typeof candidate.api?.topP === 'number' && Number.isFinite(candidate.api.topP)
      ? candidate.api.topP
      : defaults.api.topP,
    rememberKey,
    providerOptions: candidate.api?.providerOptions && typeof candidate.api.providerOptions === 'object'
      ? Object.fromEntries(Object.entries(candidate.api.providerOptions).map(([key, option]) => [key, typeof option === 'string' ? option.trim() : '']))
      : {},
  }
  delete (api as TavernApiConfig & { maxTokens?: number }).maxTokens
  if (!rememberKey || !candidate.api?.persistedApiKey?.trim()) delete api.persistedApiKey
  else api.persistedApiKey = candidate.api.persistedApiKey.trim()

  const { adapterMode: _legacyAdapterMode, ...safeCandidate } = candidate
  let globalVariables = defaults.globalVariables
  if (Array.isArray(candidate.globalVariables)) {
    try {
      globalVariables = parseVariableDefinitions(candidate.globalVariables).filter((definition) => definition.scope === 'global')
    } catch {
      globalVariables = defaults.globalVariables
    }
  }
  let regexScripts = defaults.regexScripts
  if (Array.isArray(candidate.regexScripts)) {
    try {
      regexScripts = parseRegexScripts(candidate.regexScripts, 'global').filter((script) => script.scope === 'global')
    } catch {
      regexScripts = defaults.regexScripts
    }
  }
  return {
    ...defaults,
    ...safeCandidate,
    key: 'mistvale-settings',
    api,
    activeLorebookIds: Array.isArray(candidate.activeLorebookIds) ? candidate.activeLorebookIds : defaults.activeLorebookIds,
    customTags: Array.isArray(candidate.customTags) ? candidate.customTags : defaults.customTags,
    globalVariables,
    regexScripts,
  }
}
