import type { CharacterCard, ChatPreset, Lorebook, LorebookEntry } from './types'
import { validatePresetSettings } from './preset-compat'
import { legacyPortraitsToSlots, parsePortraitSlots } from './portrait-slots'

export const TAVERN_CONTENT_PACK_PATH = 'content/mistvale-content-pack.json'
export const MAX_CONTENT_PACK_BYTES = 12 * 1024 * 1024

export interface TavernContentPack {
  schemaVersion: 1
  contentVersion: string
  exportedAt: string
  lorebooks: Lorebook[]
  presets: ChatPreset[]
  characters: CharacterCard[]
}

interface CreateContentPackInput {
  contentVersion: string
  lorebooks: Lorebook[]
  presets: ChatPreset[]
  characters: CharacterCard[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const isString = (value: unknown): value is string => typeof value === 'string'
const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every(isString)
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const isOptionalString = (value: unknown) => value === undefined || isString(value)
const isOptionalNumber = (value: unknown) => value === undefined || isFiniteNumber(value)
const isOptionalBoolean = (value: unknown) => value === undefined || typeof value === 'boolean'

const positions = new Set<LorebookEntry['position']>(['before_char', 'after_char', 'before_example', 'after_example', 'at_depth', 'example_msg_top', 'example_msg_bottom', 'outlet'])
const selectiveLogics = new Set<LorebookEntry['selectiveLogic']>(['and_any', 'not_all', 'not_any', 'and_all'])

function isLorebookEntry(value: unknown): value is LorebookEntry {
  if (!isRecord(value)) return false
  return isString(value.id)
    && isStringArray(value.keys)
    && isStringArray(value.secondaryKeys)
    && isString(value.content)
    && isOptionalString(value.comment)
    && isFiniteNumber(value.order)
    && positions.has(value.position as LorebookEntry['position'])
    && isOptionalNumber(value.depth)
    && isOptionalNumber(value.role)
    && typeof value.selective === 'boolean'
    && selectiveLogics.has(value.selectiveLogic as LorebookEntry['selectiveLogic'])
    && typeof value.constant === 'boolean'
    && isFiniteNumber(value.probability)
    && typeof value.addMemo === 'boolean'
    && isOptionalBoolean(value.disabled)
    && isOptionalBoolean(value.excluded)
    && (value.decorators === undefined || isStringArray(value.decorators))
}

function isLorebook(value: unknown): value is Lorebook {
  return isRecord(value)
    && isString(value.id)
    && isString(value.name)
    && isOptionalString(value.description)
    && Array.isArray(value.entries)
    && value.entries.every(isLorebookEntry)
    && typeof value.recursiveScanning === 'boolean'
    && typeof value.caseSensitive === 'boolean'
    && typeof value.matchWholeWords === 'boolean'
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt)
}

function isPreset(value: unknown): value is ChatPreset {
  if (!isRecord(value) || !isRecord(value.settings)) return false
  try { validatePresetSettings(value.settings) } catch { return false }
  return isString(value.id)
    && isString(value.name)
    && isOptionalString(value.description)
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt)
}

function parseCharacter(value: unknown): CharacterCard | null {
  if (!isRecord(value)) return null
  const hasValidFields = ['id', 'npcId', 'name', 'role', 'locationId', 'description', 'personality', 'scenario', 'firstMessage', 'exampleDialogue'].every((key) => isString(value[key]))
    && isStringArray(value.lorebookIds)
    && isStringArray(value.tags)
    && isFiniteNumber(value.createdAt)
    && isFiniteNumber(value.updatedAt)
  if (!hasValidFields) return null

  try {
    const portraitSlots = value.portraitSlots === undefined
      ? legacyPortraitsToSlots(value.portraitByAffinity)
      : parsePortraitSlots(value.portraitSlots)
    const { portraitByAffinity: _legacyPortraits, portraitSlots: _rawSlots, ...character } = value
    return { ...character, portraitSlots } as unknown as CharacterCard
  } catch {
    return null
  }
}

export function estimateContentPackBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function createContentPack(input: CreateContentPackInput): TavernContentPack {
  return parseContentPack({
    schemaVersion: 1,
    contentVersion: input.contentVersion.trim(),
    exportedAt: new Date().toISOString(),
    lorebooks: input.lorebooks,
    presets: input.presets,
    characters: input.characters,
  })
}

export function parseContentPack(value: unknown): TavernContentPack {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('内容包格式或架构版本无效。')
  if (!isString(value.contentVersion) || !value.contentVersion.trim()) throw new Error('内容包缺少可发布的版本号。')
  if (!isString(value.exportedAt) || Number.isNaN(Date.parse(value.exportedAt))) throw new Error('内容包导出时间无效。')
  if (!Array.isArray(value.lorebooks) || !value.lorebooks.every(isLorebook)) throw new Error('内容包包含无效的世界书。')
  if (!Array.isArray(value.presets) || !value.presets.every(isPreset)) throw new Error('内容包包含无效的预设。')
  if (!Array.isArray(value.characters)) throw new Error('内容包包含无效的角色卡或立绘区间。')
  if (estimateContentPackBytes(value) > MAX_CONTENT_PACK_BYTES) throw new Error('内容包超过 12 MB 发布预算，请改用仓库静态图片路径。')
  const characters = value.characters.map(parseCharacter)
  if (characters.some((character) => character === null)) throw new Error('内容包包含无效的角色卡或立绘区间。')
  return structuredClone({ ...value, characters }) as unknown as TavernContentPack
}

export async function loadRepositoryContentPack(fetcher: typeof fetch = fetch): Promise<TavernContentPack | null> {
  try {
    const response = await fetcher(TAVERN_CONTENT_PACK_PATH, { cache: 'no-cache' })
    if (!response.ok) throw new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`)
    return parseContentPack(await response.json())
  } catch (caught) {
    throw new Error(`仓库内容包加载失败：${caught instanceof Error ? caught.message : '未知错误'}`, { cause: caught })
  }
}

export function mergeById<T extends { id: string }>(base: T[], overrides: T[]): T[] {
  const values = new Map(base.map((item) => [item.id, item]))
  for (const item of overrides) values.set(item.id, item)
  return [...values.values()]
}
