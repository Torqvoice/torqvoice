'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  type ThemeId,
  type ThemePreference,
  applyTheme,
  getThemeMode,
  isThemePreference,
} from '@/lib/themes'

interface ThemeContextType {
  /** What the user picked, which may be 'system'. */
  theme: ThemePreference
  /** The theme actually on screen ('system' already resolved). */
  resolvedTheme: ThemeId
  /** Whether the active theme is a light or a dark one. */
  mode: 'light' | 'dark'
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  resolvedTheme: DEFAULT_THEME,
  mode: getThemeMode(DEFAULT_THEME),
  setTheme: () => {
    // Default empty implementation
  },
})

function resolvePreference(theme: ThemePreference): ThemeId {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined') return DEFAULT_THEME
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
}: {
  children: React.ReactNode
  defaultTheme?: ThemePreference
}) {
  const [theme, setTheme] = useState<ThemePreference>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(THEME_STORAGE_KEY)
      if (isThemePreference(stored)) return stored
    }
    return defaultTheme
  })

  const [resolvedTheme, setResolvedTheme] = useState<ThemeId>(() => resolvePreference(theme))

  useEffect(() => {
    const root = window.document.documentElement

    const paint = () => {
      const active = resolvePreference(theme)
      setResolvedTheme(active)

      // A child layout can set data-force-theme to override the user preference
      if (root.hasAttribute('data-force-theme')) return
      applyTheme(root, active)
    }

    paint()
    localStorage.setItem(THEME_STORAGE_KEY, theme)

    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', paint)
    return () => media.removeEventListener('change', paint)
  }, [theme])

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, mode: getThemeMode(resolvedTheme), setTheme }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
