/**
 * Theme registry.
 *
 * Every theme is a set of CSS custom properties declared in globals.css. The
 * two base themes (`light`, `dark`) live on `:root` / `.dark`; the presets add
 * a `theme-<id>` class on top of their base mode class, so a dark preset is
 * applied as `class="dark theme-midnight"`. Keeping the mode class means the
 * `dark:` Tailwind variant and the `.dark`-scoped utilities keep working for
 * every preset.
 */

export type ThemeId = 'light' | 'dark' | 'graphite' | 'ocean' | 'forest' | 'midnight' | 'carbon'

/** What the user picks: a theme, or "follow the OS". */
export type ThemePreference = ThemeId | 'system'

export interface ThemeDefinition {
  id: ThemeId
  mode: 'light' | 'dark'
  /** Literal colors for the settings preview: [background, surface, primary]. */
  swatch: [string, string, string]
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'light',
    mode: 'light',
    swatch: ['oklch(0.98 0.008 85)', 'oklch(0.93 0.04 80)', 'oklch(0.72 0.17 75)'],
  },
  {
    id: 'dark',
    mode: 'dark',
    swatch: ['oklch(0.12 0.01 70)', 'oklch(0.24 0.03 75)', 'oklch(0.78 0.16 80)'],
  },
  {
    id: 'graphite',
    mode: 'light',
    swatch: ['oklch(0.98 0.002 250)', 'oklch(0.93 0.02 250)', 'oklch(0.52 0.13 250)'],
  },
  {
    id: 'ocean',
    mode: 'light',
    swatch: ['oklch(0.98 0.012 220)', 'oklch(0.91 0.045 205)', 'oklch(0.52 0.12 215)'],
  },
  {
    id: 'forest',
    mode: 'light',
    swatch: ['oklch(0.98 0.008 140)', 'oklch(0.92 0.04 145)', 'oklch(0.5 0.12 150)'],
  },
  {
    id: 'midnight',
    mode: 'dark',
    swatch: ['oklch(0.16 0.03 260)', 'oklch(0.3 0.05 255)', 'oklch(0.7 0.14 245)'],
  },
  {
    id: 'carbon',
    mode: 'dark',
    swatch: ['oklch(0.15 0 0)', 'oklch(0.28 0.02 165)', 'oklch(0.72 0.15 165)'],
  },
]

export const THEME_IDS = THEMES.map((t) => t.id)

/** Storage key shared with the pre-hydration script in the root layout. */
export const THEME_STORAGE_KEY = 'torqvoice-theme'

export const DEFAULT_THEME: ThemeId = 'dark'

/** Every class this module may put on <html>, so we can clear them in one go. */
export const ALL_THEME_CLASSES = ['light', 'dark', ...THEMES.map((t) => `theme-${t.id}`)]

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as string[]).includes(value)
}

export function isThemePreference(value: string | null | undefined): value is ThemePreference {
  return value === 'system' || isThemeId(value)
}

export function getThemeMode(id: ThemeId): 'light' | 'dark' {
  return THEMES.find((t) => t.id === id)?.mode ?? 'dark'
}

/** The classes that make up a theme: its mode, plus a preset class when needed. */
export function getThemeClasses(id: ThemeId): string[] {
  const mode = getThemeMode(id)
  return id === mode ? [mode] : [mode, `theme-${id}`]
}

/** Swap <html> over to `id`, removing whatever theme was there before. */
export function applyTheme(root: HTMLElement, id: ThemeId) {
  root.classList.remove(...ALL_THEME_CLASSES)
  root.classList.add(...getThemeClasses(id))
}
