import { parseContentPack } from '../sillytavern/content-pack'
import { parsePortraitSlots } from '../sillytavern/portrait-slots'
import type { WorkshopKind, WorkshopPackage, WorkshopPortraitCharacter } from './types'

export const MAX_WORKSHOP_PACKAGE_BYTES = 8 * 1024 * 1024
export const MAX_TEXT_WORKSHOP_PACKAGE_BYTES = 2 * 1024 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const visible = (value: unknown, label: string, min: number, max: number): string => {
  if (typeof value !== 'string') throw new Error(`${label}必须是文本。`)
  const normalized = value.trim()
  if (normalized.length < min || normalized.length > max) throw new Error(`${label}长度必须为 ${min}—${max} 个字符。`)
  return normalized
}

function assertDate(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label}无效。`)
  return value
}

function assertNoPrivateFields(value: Record<string, unknown>): void {
  const forbidden = ['apiKey', 'persistedApiKey', 'sessions', 'chatHistory', 'gameSave', 'globalVariables', 'apiConfig']
  if (forbidden.some((key) => key in value)) throw new Error('资源包包含不允许字段。')
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error('标签最多允许 8 个。')
  const tags = value.map((tag) => visible(tag, '标签', 1, 20))
  if (new Set(tags).size !== tags.length) throw new Error('标签不能重复。')
  return tags
}

function isWorkshopPortraitSource(source: string): boolean {
  if (!source) return true
  if (/^https:\/\//i.test(source)) return true
  return /^data:image\/(?:png|webp);base64,[a-z0-9+/=\s]+$/i.test(source)
}

function parsePortraitCharacters(value: unknown): WorkshopPortraitCharacter[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) throw new Error('立绘组必须包含 1—12 位角色。')
  const seen = new Set<string>()
  return value.map((candidate) => {
    if (!isRecord(candidate)) throw new Error('立绘组角色结构无效。')
    const npcId = visible(candidate.npcId, '角色 ID', 1, 80)
    if (seen.has(npcId)) throw new Error('立绘组角色 ID 不能重复。')
    seen.add(npcId)
    if (!Array.isArray(candidate.portraitSlots) || candidate.portraitSlots.length > 8) throw new Error('每位角色最多允许 8 个立绘区间。')
    const portraitSlots = parsePortraitSlots(candidate.portraitSlots)
    if (portraitSlots.some((slot) => !isWorkshopPortraitSource(slot.source))) throw new Error('立绘区间包含不安全的图片来源。')
    return { npcId, name: visible(candidate.name, '角色名称', 1, 60), portraitSlots }
  })
}

export function estimateWorkshopPackageBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

export function parseWorkshopPackage(value: unknown, byteLimit = MAX_WORKSHOP_PACKAGE_BYTES): WorkshopPackage {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.payload)) throw new Error('创意工坊资源包格式无效。')
  assertNoPrivateFields(value)
  const kind = value.kind
  if (kind !== 'lorebook' && kind !== 'preset' && kind !== 'portrait-pack') throw new Error('资源类型无效。')
  const specificLimit = kind === 'portrait-pack' ? byteLimit : Math.min(byteLimit, MAX_TEXT_WORKSHOP_PACKAGE_BYTES)
  if (estimateWorkshopPackageBytes(value) > specificLimit) throw new Error('资源包超过当前类型的大小上限。')
  const base = {
    schemaVersion: 1 as const,
    kind: kind as WorkshopKind,
    title: visible(value.title, '标题', 1, 60),
    description: visible(value.description, '简介', 10, 600),
    version: visible(value.version, '版本号', 1, 24),
    tags: parseTags(value.tags),
    createdAt: assertDate(value.createdAt, '创建时间'),
    updatedAt: assertDate(value.updatedAt, '更新时间'),
  }
  const exportedAt = new Date().toISOString()
  if (kind === 'lorebook') {
    const parsed = parseContentPack({ schemaVersion: 1, contentVersion: 'workshop-validation', exportedAt, lorebooks: [value.payload.lorebook], presets: [], characters: [] })
    return structuredClone({ ...base, kind, payload: { lorebook: parsed.lorebooks[0] } })
  }
  if (kind === 'preset') {
    const parsed = parseContentPack({ schemaVersion: 1, contentVersion: 'workshop-validation', exportedAt, lorebooks: [], presets: [value.payload.preset], characters: [] })
    return structuredClone({ ...base, kind, payload: { preset: parsed.presets[0] } })
  }
  return structuredClone({ ...base, kind, payload: { characters: parsePortraitCharacters(value.payload.characters) } })
}

