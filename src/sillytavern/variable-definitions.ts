import type { TavernVariableDefinition, TavernVariableScope, TavernVariableType } from './types'

const VARIABLE_KEY = /^[A-Za-z_\u4e00-\u9fff][A-Za-z0-9_.\-\u4e00-\u9fff]{0,63}$/

function isType(value: unknown): value is TavernVariableType {
  return value === 'string' || value === 'number' || value === 'boolean'
}

function isScope(value: unknown): value is TavernVariableScope {
  return value === 'global' || value === 'session'
}

export function coerceVariableValue(type: TavernVariableType, value: unknown): string | number | boolean {
  if (type === 'number') {
    const number = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(number)) throw new Error('数字变量必须填写有效数值。')
    return number
  }
  if (type === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return true
    if (value === false || value === 'false' || value === 0 || value === '0') return false
    throw new Error('布尔变量只能使用 true 或 false。')
  }
  return typeof value === 'string' ? value : String(value ?? '')
}

export function parseVariableDefinitions(value: unknown): TavernVariableDefinition[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { variables?: unknown }).variables)
      ? (value as { variables: unknown[] }).variables
      : null
  if (!list) throw new Error('变量文件必须是数组，或包含 variables 数组。')
  const seen = new Set<string>()
  return list.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`variables[${index}] 必须是对象。`)
    const candidate = item as Partial<TavernVariableDefinition>
    const key = typeof candidate.key === 'string' ? candidate.key.trim() : ''
    if (!VARIABLE_KEY.test(key)) throw new Error(`variables[${index}].key 格式无效。`)
    if (seen.has(key)) throw new Error(`变量 ${key} 重复。`)
    seen.add(key)
    if (!isType(candidate.type)) throw new Error(`variables[${index}].type 无效。`)
    if (!isScope(candidate.scope)) throw new Error(`variables[${index}].scope 无效。`)
    const normalized: TavernVariableDefinition = {
      key,
      label: typeof candidate.label === 'string' && candidate.label.trim() ? candidate.label.trim() : key,
      type: candidate.type,
      scope: candidate.scope,
      value: coerceVariableValue(candidate.type, candidate.value),
      description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    }
    if (candidate.type === 'number') {
      const numericValue = normalized.value as number
      if (candidate.min !== undefined && !Number.isFinite(candidate.min)) throw new Error(`variables[${index}].min 无效。`)
      if (candidate.max !== undefined && !Number.isFinite(candidate.max)) throw new Error(`variables[${index}].max 无效。`)
      if (candidate.min !== undefined) normalized.min = candidate.min
      if (candidate.max !== undefined) normalized.max = candidate.max
      if (normalized.min !== undefined && normalized.max !== undefined && normalized.min > normalized.max) {
        throw new Error(`变量 ${key} 的最小值不能大于最大值。`)
      }
      if (normalized.min !== undefined && numericValue < normalized.min) throw new Error(`变量 ${key} 低于最小值。`)
      if (normalized.max !== undefined && numericValue > normalized.max) throw new Error(`变量 ${key} 高于最大值。`)
    }
    return normalized
  })
}

export function inferVariableDefinitions(
  variables: Record<string, unknown>,
  scope: TavernVariableScope = 'session',
): TavernVariableDefinition[] {
  return Object.entries(variables)
    .filter((entry): entry is [string, string | number | boolean] => ['string', 'number', 'boolean'].includes(typeof entry[1]))
    .map(([key, value]) => ({ key, label: key, type: typeof value as TavernVariableType, value, scope }))
}

export function variableDefinitionsToRecord(definitions: TavernVariableDefinition[]): Record<string, string | number | boolean> {
  return Object.fromEntries(definitions.map((definition) => [definition.key, definition.value]))
}

export interface DefinedVariablePatchInput {
  patch: Record<string, unknown>
  globalDefinitions: TavernVariableDefinition[]
  sessionDefinitions: TavernVariableDefinition[]
  readOnlyKeys?: Iterable<string>
}

export interface DefinedVariablePatchResult {
  globalDefinitions: TavernVariableDefinition[]
  sessionDefinitions: TavernVariableDefinition[]
  sessionVariables: Record<string, string | number | boolean>
  diagnostics: string[]
}

/** Apply a model-authored patch without allowing it to invent or shadow state. */
export function applyDefinedVariablePatch(input: DefinedVariablePatchInput): DefinedVariablePatchResult {
  const globalDefinitions = input.globalDefinitions.map((definition) => ({ ...definition }))
  const sessionDefinitions = input.sessionDefinitions.map((definition) => ({ ...definition }))
  const readOnly = new Set(input.readOnlyKeys ?? [])
  const diagnostics: string[] = []
  const globalByKey = new Map(globalDefinitions.map((definition) => [definition.key, definition]))
  const sessionByKey = new Map(sessionDefinitions.map((definition) => [definition.key, definition]))

  for (const [key, rawValue] of Object.entries(input.patch)) {
    if (readOnly.has(key)) {
      diagnostics.push(`模型变量“${key}”是只读游戏镜像，已忽略更新。`)
      continue
    }
    if (globalByKey.has(key) && sessionByKey.has(key)) {
      diagnostics.push(`变量“${key}”同时存在于全局与会话作用域，已忽略歧义更新。`)
      continue
    }
    const definition = sessionByKey.get(key) ?? globalByKey.get(key)
    if (!definition) {
      diagnostics.push(`模型返回了未声明变量“${key}”，已忽略更新。`)
      continue
    }
    try {
      let value = coerceVariableValue(definition.type, rawValue)
      if (definition.type === 'number') {
        const original = value as number
        if (definition.min !== undefined) value = Math.max(definition.min, value as number)
        if (definition.max !== undefined) value = Math.min(definition.max, value as number)
        if (value !== original) diagnostics.push(`变量“${key}”已按定义范围限制为 ${value}。`)
      }
      definition.value = value
    } catch (caught) {
      diagnostics.push(`变量“${key}”更新无效，已保留原值：${caught instanceof Error ? caught.message : '无法转换类型'}`)
    }
  }

  return {
    globalDefinitions,
    sessionDefinitions,
    sessionVariables: variableDefinitionsToRecord(sessionDefinitions),
    diagnostics,
  }
}
