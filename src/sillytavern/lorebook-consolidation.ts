import type { Lorebook } from './types'

export const WORLD_RULES_ID = 'mistvale-world-rules'
export const VILLAGE_ARCHIVE_ID = 'mistvale-village-archive'
export const CALENDAR_FESTIVALS_ID = 'mistvale-calendar-festivals'
export const PRODUCTION_PARTNERS_ID = 'mistvale-production-partners'

export const LEGACY_MISTVALE_LOREBOOK_IDS = [
  WORLD_RULES_ID,
  VILLAGE_ARCHIVE_ID,
  CALENDAR_FESTIVALS_ID,
  PRODUCTION_PARTNERS_ID,
] as const

const LEGACY_ID_SET = new Set<string>(LEGACY_MISTVALE_LOREBOOK_IDS)

export function consolidateMistvaleLorebooks(books: readonly Lorebook[], updatedAt = Date.now()): Lorebook | null {
  const byId = new Map(books.map((book) => [book.id, book]))
  const ordered = LEGACY_MISTVALE_LOREBOOK_IDS
    .map((id) => byId.get(id))
    .filter((book): book is Lorebook => Boolean(book))
  if (ordered.length === 0) return null

  const primary = byId.get(WORLD_RULES_ID) ?? ordered[0]
  return {
    ...primary,
    id: WORLD_RULES_ID,
    name: '雾灯谷·全域设定集',
    description: '整合世界规则、人物地点、岁时庆典、农场生产与共生伙伴的完整设定。',
    recursiveScanning: ordered.some((book) => book.recursiveScanning),
    caseSensitive: ordered.every((book) => book.caseSensitive),
    matchWholeWords: ordered.every((book) => book.matchWholeWords),
    createdAt: Math.min(...ordered.map((book) => book.createdAt)),
    updatedAt,
    entries: ordered.flatMap((book) => book.entries),
  }
}

export function mapConsolidatedLorebookIds(ids: readonly string[]): string[] {
  const mapped: string[] = []
  const seen = new Set<string>()
  for (const id of ids) {
    const nextId = LEGACY_ID_SET.has(id) ? WORLD_RULES_ID : id
    if (seen.has(nextId)) continue
    seen.add(nextId)
    mapped.push(nextId)
  }
  return mapped
}
