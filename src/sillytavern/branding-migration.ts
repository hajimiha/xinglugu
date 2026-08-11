const BRAND_REPLACEMENTS = [
  ['雾灯谷纪事', '性撸谷物语'],
  ['雾灯酒馆', '性撸谷酒馆'],
  ['雾灯叙事预设', '性撸谷叙事预设'],
  ['雾灯谷', '性撸谷'],
  ['MISTVALE', 'XINGLUGU'],
] as const

function migrateBrandString(value: string): string {
  return BRAND_REPLACEMENTS.reduce(
    (result, [legacyName, nextName]) => result.replaceAll(legacyName, nextName),
    value,
  )
}

/**
 * Migrates only the editable product-facing copy of built-in Tavern resources.
 * `compatibility` is deliberately cloned without transformation because it is
 * the lossless SillyTavern import/export payload and must round-trip verbatim.
 */
export function migrateSystemBranding<T>(value: T): T {
  if (typeof value === 'string') return migrateBrandString(value) as T
  if (Array.isArray(value)) return value.map((item) => migrateSystemBranding(item)) as T
  if (value === null || typeof value !== 'object') return value

  const migrated: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    migrated[key] = key === 'compatibility'
      ? structuredClone(entry)
      : migrateSystemBranding(entry)
  }
  return migrated as T
}
