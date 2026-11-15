/**
 * The portal's themes: which exist, each one's default colour, and how text
 * on that colour is chosen.
 *
 * A theme is a set of CSS variables (`portal-themes.css`) and three
 * compositions of its own (`Components/Themes/<Theme>/`). The workshop picks
 * one in its settings; a customer never does. Nothing here touches the
 * database, so the settings screen can import it in a client component:
 * reading a workshop's choice lives in `portalLook.server.ts`.
 */

export const PORTAL_THEMES = ['daylight', 'garage', 'print', 'colour'] as const
export type PortalTheme = (typeof PORTAL_THEMES)[number]

/** What a workshop gets until it picks another. */
export const DEFAULT_PORTAL_THEME: PortalTheme = 'daylight'

export function isPortalTheme(value: string | null | undefined): value is PortalTheme {
  return PORTAL_THEMES.includes(value as PortalTheme)
}

/** The theme a stored setting names; the default for anything else. */
export function resolvePortalTheme(value: string | null | undefined): PortalTheme {
  return isPortalTheme(value) ? value : DEFAULT_PORTAL_THEME
}

/** Each theme's own colour, used until the workshop sets its own. */
export const PORTAL_THEME_ACCENTS: Record<PortalTheme, string> = {
  daylight: '#C2410C',
  garage: '#FFD60A',
  print: '#0F4C3A',
  colour: '#1D4ED8',
}

/** The two inks that can sit on an accent. */
export const ON_ACCENT_LIGHT = '#FFFFFF'
export const ON_ACCENT_DARK = '#0C0D0E'

/**
 * A stored colour as "#RRGGBB" in capitals, or null when it is not a colour.
 * Takes "#abc" and "abc" too, since a workshop may type either.
 */
export function normalizeAccent(value: string | null | undefined): string | null {
  const raw = value?.trim().replace(/^#/, '') ?? ''
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split('')
      .map((c) => c + c)
      .join('')
      .toUpperCase()}`
  }
  return null
}

/** The accent a workshop's portal uses: its own colour, or the theme's. */
export function resolvePortalAccent(theme: PortalTheme, stored: string | null | undefined): string {
  return normalizeAccent(stored) ?? PORTAL_THEME_ACCENTS[theme]
}

/** WCAG relative luminance of "#RRGGBB". */
function luminance(hex: string): number {
  const channel = (index: number) => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}

/** WCAG contrast ratio between two "#RRGGBB" colours, 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The ink for text and icons on the accent: white or near-black, whichever
 * reads better against it. A colour that is not a colour gets white.
 */
export function onAccentFor(hex: string): string {
  const accent = normalizeAccent(hex)
  if (!accent) return ON_ACCENT_LIGHT
  return contrastRatio(accent, ON_ACCENT_LIGHT) >= contrastRatio(accent, ON_ACCENT_DARK)
    ? ON_ACCENT_LIGHT
    : ON_ACCENT_DARK
}

/** What every portal page needs to know to draw itself. */
export interface PortalLook {
  theme: PortalTheme
  /** "#RRGGBB": the workshop's colour, or the theme's default. */
  accent: string
  /** "#RRGGBB": the ink on the accent. */
  onAccent: string
  /** The cover photo of the sign-in page, when the workshop uploaded one. */
  coverUrl: string | null
  /** The workshop's logo, when it has one. */
  logoUrl: string | null
  /** The chat with the workshop is on. */
  messagesEnabled: boolean
  /** Stored tyres show: the workshop runs a tyre hotel and has not hidden them. */
  showTires: boolean
}

/** The look of a workshop that has chosen nothing, and of a page without a workshop. */
export const DEFAULT_PORTAL_LOOK: PortalLook = {
  theme: DEFAULT_PORTAL_THEME,
  accent: PORTAL_THEME_ACCENTS[DEFAULT_PORTAL_THEME],
  onAccent: onAccentFor(PORTAL_THEME_ACCENTS[DEFAULT_PORTAL_THEME]),
  coverUrl: null,
  logoUrl: null,
  messagesEnabled: true,
  showTires: false,
}

/**
 * The attributes that give an element the theme's variables and the
 * workshop's colour. `PortalRoot` and `PortalScope` spread them; nothing else
 * should need to.
 */
export function portalThemeProps(look: Pick<PortalLook, 'theme' | 'accent' | 'onAccent'>): {
  'data-portal-theme': PortalTheme
  style: Record<string, string>
} {
  return {
    'data-portal-theme': look.theme,
    style: { '--p-accent': look.accent, '--p-on-accent': look.onAccent },
  }
}
