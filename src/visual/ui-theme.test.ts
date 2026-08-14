import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_UI_THEME,
  readStoredUiTheme,
  UI_THEME_STORAGE_KEY,
  writeStoredUiTheme,
  type UiThemeStorage,
} from './ui-theme'

function memoryStorage(initial?: string): UiThemeStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem() { return this.value },
    setItem(_key, value) { this.value = value },
  }
}

describe('UI theme storage', () => {
  it('reads and writes a supported theme', () => {
    const storage = memoryStorage('tide')
    expect(readStoredUiTheme(storage)).toBe('tide')
    expect(writeStoredUiTheme('wisteria', storage)).toBe(true)
    expect(storage.value).toBe('wisteria')
  })

  it('falls back when stored data is unknown', () => {
    expect(readStoredUiTheme(memoryStorage('unknown-rainbow'))).toBe(DEFAULT_UI_THEME)
  })

  it('does not crash when browser storage is blocked', () => {
    const blocked: UiThemeStorage = {
      getItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError') }),
      setItem: vi.fn(() => { throw new DOMException('blocked', 'SecurityError') }),
    }
    expect(readStoredUiTheme(blocked)).toBe(DEFAULT_UI_THEME)
    expect(writeStoredUiTheme('blossom', blocked)).toBe(false)
  })

  it('uses a namespaced key', () => {
    expect(UI_THEME_STORAGE_KEY).toContain('ui-theme')
  })
})
