export type UiThemeId = 'forest' | 'tide' | 'wisteria' | 'blossom'

export interface UiThemeStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface UiThemeOption {
  id: UiThemeId
  name: string
  subtitle: string
  description: string
  swatches: readonly [string, string, string]
}

export const UI_THEME_STORAGE_KEY = 'xinglugu.ui-theme.v1'
export const DEFAULT_UI_THEME: UiThemeId = 'forest'

export const UI_THEME_OPTIONS: readonly UiThemeOption[] = [
  {
    id: 'forest',
    name: '深林鎏金',
    subtitle: 'FOREST GILT',
    description: '苔绿、旧金与暖木色，保留经典村庄质感。',
    swatches: ['#17352b', '#d5a64a', '#86b86d'],
  },
  {
    id: 'tide',
    name: '潮汐蓝晶',
    subtitle: 'TIDAL CRYSTAL',
    description: '深海蓝、青晶与浅金，适合清冷明快的界面。',
    swatches: ['#132f43', '#4dc4c7', '#e9c56f'],
  },
  {
    id: 'wisteria',
    name: '紫藤星砂',
    subtitle: 'WISTERIA DUST',
    description: '靛紫、藤花紫与柔金，强调魔法与夜空层次。',
    swatches: ['#31234b', '#aa85dc', '#e8bb6c'],
  },
  {
    id: 'blossom',
    name: '绯樱晚霞',
    subtitle: 'BLOSSOM GLOW',
    description: '酒红、绯樱与琥珀，带来更温暖鲜明的氛围。',
    swatches: ['#4a2534', '#df8298', '#efb95f'],
  },
] as const

const themeIds = new Set<UiThemeId>(UI_THEME_OPTIONS.map((theme) => theme.id))

export function isUiThemeId(value: unknown): value is UiThemeId {
  return typeof value === 'string' && themeIds.has(value as UiThemeId)
}

export function getBrowserUiThemeStorage(): UiThemeStorage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function readStoredUiTheme(storage: UiThemeStorage | null = getBrowserUiThemeStorage()): UiThemeId {
  if (!storage) return DEFAULT_UI_THEME
  try {
    const stored = storage.getItem(UI_THEME_STORAGE_KEY)
    return isUiThemeId(stored) ? stored : DEFAULT_UI_THEME
  } catch {
    return DEFAULT_UI_THEME
  }
}

export function writeStoredUiTheme(theme: UiThemeId, storage: UiThemeStorage | null = getBrowserUiThemeStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(UI_THEME_STORAGE_KEY, theme)
    return true
  } catch {
    return false
  }
}
