import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readStoredUiTheme, writeStoredUiTheme, type UiThemeId } from './ui-theme'

interface UiThemeContextValue {
  theme: UiThemeId
  setTheme(theme: UiThemeId): void
}

const UiThemeContext = createContext<UiThemeContextValue | null>(null)

export function UiThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<UiThemeId>(() => readStoredUiTheme())

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.dataset.uiTheme = theme
    writeStoredUiTheme(theme)
  }, [theme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])
  return <UiThemeContext.Provider value={value}>{children}</UiThemeContext.Provider>
}

export function useUiTheme(): UiThemeContextValue {
  const context = useContext(UiThemeContext)
  if (!context) throw new Error('useUiTheme must be used inside UiThemeProvider')
  return context
}
