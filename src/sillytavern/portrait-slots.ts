import type { PortraitSlot } from './types'

const LEGACY_STAGES = [
  { key: 'stranger', minAffinity: 0, maxAffinity: 19 },
  { key: 'acquainted', minAffinity: 20, maxAffinity: 44 },
  { key: 'trusted', minAffinity: 45, maxAffinity: 74 },
  { key: 'intimate', minAffinity: 75, maxAffinity: 99 },
  { key: 'bonded', minAffinity: 100, maxAffinity: 100 },
] as const

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

export const isSafePortraitSource = (value: string) => !value
  || value.startsWith('data:image/png;base64,')
  || value.startsWith('data:image/jpeg;base64,')
  || value.startsWith('data:image/webp;base64,')
  || value.startsWith('/')
  || value.startsWith('./')
  || value.startsWith('https://')

function assertRange(minAffinity: number, maxAffinity: number) {
  if (!Number.isInteger(minAffinity) || !Number.isInteger(maxAffinity)) throw new Error('好感度区间必须使用整数。')
  if (minAffinity < 0 || maxAffinity > 100) throw new Error('好感度区间必须位于 0—100。')
  if (minAffinity > maxAffinity) throw new Error('起始好感度不能大于结束好感度。')
}

function assertSlot(value: unknown): asserts value is PortraitSlot {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id.trim()) throw new Error('立绘区间缺少有效 ID。')
  if (typeof value.minAffinity !== 'number' || typeof value.maxAffinity !== 'number') throw new Error('立绘区间缺少好感度边界。')
  assertRange(value.minAffinity, value.maxAffinity)
  if (typeof value.source !== 'string' || !isSafePortraitSource(value.source)) throw new Error('立绘区间包含不安全的图片来源。')
}

export function createDefaultPortraitSlots(source = ''): PortraitSlot[] {
  if (!isSafePortraitSource(source)) throw new Error('立绘区间包含不安全的图片来源。')
  return [{ id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source }]
}

export function parsePortraitSlots(value: unknown): PortraitSlot[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('角色卡至少需要一个立绘区间。')
  value.forEach(assertSlot)
  const sorted = value.map((slot) => ({ ...slot })).sort((a, b) => a.minAffinity - b.minAffinity)
  if (new Set(sorted.map((slot) => slot.id)).size !== sorted.length) throw new Error('立绘区间 ID 不能重复。')
  if (sorted[0].minAffinity !== 0 || sorted.at(-1)?.maxAffinity !== 100) throw new Error('立绘区间必须完整覆盖 0—100。')
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    if (current.minAffinity <= previous.maxAffinity) throw new Error('立绘区间不能重叠。')
    if (current.minAffinity !== previous.maxAffinity + 1) throw new Error('立绘区间必须连续，不能留空。')
  }
  return sorted
}

export function insertPortraitSlot(slots: PortraitSlot[], nextSlot: PortraitSlot): PortraitSlot[] {
  const current = parsePortraitSlots(slots)
  assertSlot(nextSlot)
  if (current.some((slot) => slot.id === nextSlot.id)) throw new Error('立绘区间 ID 不能重复。')
  const remaining: PortraitSlot[] = []
  for (const slot of current) {
    if (slot.maxAffinity < nextSlot.minAffinity || slot.minAffinity > nextSlot.maxAffinity) {
      remaining.push(slot)
      continue
    }
    if (slot.minAffinity < nextSlot.minAffinity) {
      remaining.push({ ...slot, maxAffinity: nextSlot.minAffinity - 1 })
    }
    if (slot.maxAffinity > nextSlot.maxAffinity) {
      remaining.push({
        ...slot,
        id: `${slot.id}-right-${nextSlot.maxAffinity + 1}`,
        minAffinity: nextSlot.maxAffinity + 1,
      })
    }
  }
  return parsePortraitSlots([...remaining, { ...nextSlot }])
}

export function removePortraitSlot(slots: PortraitSlot[], slotId: string): PortraitSlot[] {
  const current = parsePortraitSlots(slots)
  if (current.length === 1) throw new Error('唯一的 0—100 立绘槽位不能删除。')
  const index = current.findIndex((slot) => slot.id === slotId)
  if (index < 0) throw new Error('找不到要删除的立绘区间。')
  const target = current[index]
  const remaining = current.filter((slot) => slot.id !== slotId)
  if (index > 0) remaining[index - 1] = { ...remaining[index - 1], maxAffinity: target.maxAffinity }
  else remaining[0] = { ...remaining[0], minAffinity: target.minAffinity }
  return parsePortraitSlots(remaining)
}

export function resolvePortraitSlot(slots: PortraitSlot[], affinity: number): PortraitSlot | undefined {
  const value = Math.max(0, Math.min(100, Math.floor(Number.isFinite(affinity) ? affinity : 0)))
  return slots.find((slot) => value >= slot.minAffinity && value <= slot.maxAffinity)
}

export function legacyPortraitsToSlots(value: unknown): PortraitSlot[] {
  if (!isRecord(value)) return createDefaultPortraitSlots()
  const sources = LEGACY_STAGES.map(({ key }) => {
    const source = value[key]
    if (source === undefined || source === '') return ''
    if (typeof source !== 'string' || !isSafePortraitSource(source)) throw new Error('旧角色卡包含不安全的立绘图片来源。')
    return source
  })
  const populated = sources.filter(Boolean)
  if (populated.length === 0) return createDefaultPortraitSlots()
  if (populated.length === 1) return createDefaultPortraitSlots(populated[0])

  const filled = sources.map((source, index) => {
    if (source) return source
    for (let left = index - 1; left >= 0; left -= 1) if (sources[left]) return sources[left]
    for (let right = index + 1; right < sources.length; right += 1) if (sources[right]) return sources[right]
    return ''
  })
  const slots: PortraitSlot[] = []
  LEGACY_STAGES.forEach((stage, index) => {
    const previous = slots.at(-1)
    if (previous?.source === filled[index]) {
      previous.maxAffinity = stage.maxAffinity
      return
    }
    slots.push({
      id: `portrait-legacy-${stage.key}`,
      minAffinity: stage.minAffinity,
      maxAffinity: stage.maxAffinity,
      source: filled[index],
    })
  })
  return parsePortraitSlots(slots)
}

