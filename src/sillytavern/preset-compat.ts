import { parseRegexScripts } from './regex-engine'

export type PresetPromptRole = 'system' | 'user' | 'assistant'
export type PresetPromptSourceRole = PresetPromptRole | 'model'

export interface PresetPromptDefinition extends Record<string, unknown> {
  identifier: string
  name?: string
  role?: PresetPromptRole
  content?: string
  system_prompt?: boolean
  marker?: boolean
}

export interface PresetPromptOrderItem extends Record<string, unknown> {
  identifier: string
  name?: string
  role?: PresetPromptSourceRole
  enabled?: boolean
}

export interface PresetPromptOrderGroup extends Record<string, unknown> {
  character_id: number
  order: PresetPromptOrderItem[]
}

export interface SelectedPresetPromptOrder {
  characterId: number | null
  items: PresetPromptOrderItem[]
}

const VALID_ROLES = new Set<PresetPromptRole>(['system', 'user', 'assistant'])
const VALID_SOURCE_ROLES = new Set<PresetPromptSourceRole>([...VALID_ROLES, 'model'])

interface RawPromptDefinition extends Record<string, unknown> {
  identifier: string
}

interface RawPromptOrderItem extends Record<string, unknown> {
  identifier: string
}

interface RawPromptOrderGroup extends Record<string, unknown> {
  character_id: number
  order: RawPromptOrderItem[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isRole(value: unknown): value is PresetPromptRole {
  return typeof value === 'string' && VALID_ROLES.has(value as PresetPromptRole)
}

export function normalizePresetPromptRole(value: unknown, systemPrompt?: unknown): PresetPromptRole | undefined {
  if (value === 'model') return 'assistant'
  if (isRole(value)) return value
  return systemPrompt === true ? 'system' : undefined
}

function validatePromptDefinition(value: unknown): value is RawPromptDefinition {
  if (!isRecord(value) || typeof value.identifier !== 'string' || !value.identifier.trim()) return false
  if (value.name !== undefined && typeof value.name !== 'string') return false
  if (value.title !== undefined && typeof value.title !== 'string') return false
  if (value.role !== undefined && (typeof value.role !== 'string' || !VALID_SOURCE_ROLES.has(value.role as PresetPromptSourceRole))) return false
  if (value.content !== undefined && typeof value.content !== 'string') return false
  if (value.system_prompt !== undefined && typeof value.system_prompt !== 'boolean') return false
  if (value.marker !== undefined && typeof value.marker !== 'boolean') return false
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return false
  return true
}

function validateOrderItem(value: unknown): value is RawPromptOrderItem {
  if (!isRecord(value) || typeof value.identifier !== 'string' || !value.identifier.trim()) return false
  if (value.name !== undefined && typeof value.name !== 'string') return false
  if (value.role !== undefined && (typeof value.role !== 'string' || !VALID_SOURCE_ROLES.has(value.role as PresetPromptSourceRole))) return false
  if (value.enabled !== undefined && typeof value.enabled !== 'boolean') return false
  return true
}

function validateOrderGroup(value: unknown): value is RawPromptOrderGroup {
  return isRecord(value)
    && typeof value.character_id === 'number'
    && Number.isFinite(value.character_id)
    && Array.isArray(value.order)
    && value.order.every(validateOrderItem)
}

export function validatePresetSettings(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('预设必须是 JSON 对象。')
  if (value.name !== undefined && typeof value.name !== 'string') throw new Error('预设名称必须是字符串。')
  if (value.preset !== undefined && typeof value.preset !== 'string') throw new Error('预设名称必须是字符串。')
  if (value.description !== undefined && typeof value.description !== 'string') throw new Error('预设说明必须是字符串。')

  if (value.prompts !== undefined) {
    if (!Array.isArray(value.prompts) || !value.prompts.every(validatePromptDefinition)) {
      throw new Error('预设 prompts 结构无效。')
    }
  }

  if (value.prompt_order !== undefined) {
    if (!Array.isArray(value.prompt_order)) throw new Error('预设 prompt_order 必须是数组。')
    const isGrouped = value.prompt_order.some((item) => isRecord(item) && 'order' in item)
    const valid = isGrouped
      ? value.prompt_order.every(validateOrderGroup)
      : value.prompt_order.every(validateOrderItem)
    if (!valid) throw new Error('预设 prompt_order 结构无效。')
  }

  const extensions = value.extensions
  if (extensions !== undefined && !isRecord(extensions)) throw new Error('预设 extensions 必须是对象。')
  const regexScripts = value.regex_scripts ?? (isRecord(extensions) ? extensions.regex_scripts : undefined)
  if (regexScripts !== undefined) parseRegexScripts(regexScripts, 'preset', { validatePatterns: true })

  return value
}

export function getPresetPromptDefinitions(settings: Record<string, unknown>): PresetPromptDefinition[] {
  if (!Array.isArray(settings.prompts)) return []
  return settings.prompts.filter(validatePromptDefinition).map((prompt) => {
    const name = typeof prompt.name === 'string'
      ? prompt.name
      : typeof prompt.title === 'string' ? prompt.title : undefined
    const role = normalizePresetPromptRole(prompt.role, prompt.system_prompt)
    const { role: _sourceRole, ...rest } = prompt
    return { ...rest, ...(name ? { name } : {}), ...(role ? { role } : {}) } as PresetPromptDefinition
  })
}

export function getPresetPromptOrderGroups(settings: Record<string, unknown>): PresetPromptOrderGroup[] {
  if (!Array.isArray(settings.prompt_order) || !settings.prompt_order.every(validateOrderGroup)) return []
  return settings.prompt_order.map((group) => ({
    ...group,
    character_id: group.character_id,
    order: group.order.map((item) => ({ ...item } as PresetPromptOrderItem)),
  }))
}

export function getPresetPromptOrder(
  settings: Record<string, unknown>,
  preferredCharacterId?: number | null,
): SelectedPresetPromptOrder {
  const groups = getPresetPromptOrderGroups(settings)
  if (groups.length) {
    const preferred = typeof preferredCharacterId === 'number'
      ? groups.find((group) => group.character_id === preferredCharacterId)
      : undefined
    const selected = preferred
      ?? groups.find((group) => group.character_id === 100001)
      ?? groups[0]
    return { characterId: selected.character_id, items: selected.order.map((item) => ({ ...item })) }
  }

  const flat = Array.isArray(settings.prompt_order)
    ? settings.prompt_order.filter(validateOrderItem).map((item) => ({ ...item } as PresetPromptOrderItem))
    : []
  return { characterId: null, items: flat }
}

export function updatePresetPromptOrder(
  settings: Record<string, unknown>,
  characterId: number | null,
  items: PresetPromptOrderItem[],
): Record<string, unknown> {
  const rawGroups = Array.isArray(settings.prompt_order) && settings.prompt_order.every(validateOrderGroup)
    ? settings.prompt_order
    : []
  if (!rawGroups.length) return { ...settings, prompt_order: items.map((item) => ({ ...item })) }

  const selectedId = typeof characterId === 'number'
    ? characterId
    : rawGroups.find((group) => group.character_id === 100001)?.character_id ?? rawGroups[0]?.character_id
  return {
    ...settings,
    prompt_order: rawGroups.map((group) => group.character_id === selectedId
      ? { ...group, order: items.map((item) => ({ ...item })) }
      : group),
  }
}

export function updatePresetPrompt(
  settings: Record<string, unknown>,
  identifier: string,
  patch: Partial<PresetPromptDefinition>,
): Record<string, unknown> {
  if (!Array.isArray(settings.prompts)) return settings
  let updated = false
  const prompts = settings.prompts.map((candidate) => {
    if (!updated && validatePromptDefinition(candidate) && candidate.identifier === identifier) {
      updated = true
      return { ...candidate, ...patch, identifier }
    }
    return candidate
  })
  return updated ? { ...settings, prompts } : settings
}
