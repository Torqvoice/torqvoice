/**
 * The portal's themes: which exist, what colour each starts with, and which
 * ink is put on a workshop's own colour so its buttons can always be read.
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PORTAL_LOOK,
  ON_ACCENT_DARK,
  ON_ACCENT_LIGHT,
  PORTAL_THEMES,
  PORTAL_THEME_ACCENTS,
  contrastRatio,
  isPortalTheme,
  normalizeAccent,
  onAccentFor,
  portalThemeProps,
  resolvePortalAccent,
  resolvePortalTheme,
} from '@/features/portal/Lib/theme'

describe('the themes a workshop can pick', () => {
  it('are daylight, garage, print and colour', () => {
    expect([...PORTAL_THEMES]).toEqual(['daylight', 'garage', 'print', 'colour'])
  })

  it('know their own names and nothing else', () => {
    for (const theme of PORTAL_THEMES) expect(isPortalTheme(theme)).toBe(true)
    for (const other of ['overview', 'Daylight', '', null, undefined]) {
      expect(isPortalTheme(other)).toBe(false)
    }
  })

  it('fall back to daylight for a workshop that chose nothing, or something unknown', () => {
    expect(resolvePortalTheme(null)).toBe('daylight')
    expect(resolvePortalTheme('headline')).toBe('daylight')
    expect(resolvePortalTheme('print')).toBe('print')
  })

  it('each have a colour of their own to start with', () => {
    expect(PORTAL_THEME_ACCENTS).toEqual({
      daylight: '#C2410C',
      garage: '#FFD60A',
      print: '#0F4C3A',
      colour: '#1D4ED8',
    })
  })
})

describe("the workshop's own colour", () => {
  it('is used when it is a colour, however it was typed', () => {
    expect(resolvePortalAccent('daylight', '#1d4ed8')).toBe('#1D4ED8')
    expect(resolvePortalAccent('daylight', ' 0f4c3a ')).toBe('#0F4C3A')
    expect(normalizeAccent('#fa0')).toBe('#FFAA00')
  })

  it("gives way to the theme's colour when it is missing or not a colour", () => {
    for (const stored of [null, undefined, '', 'red', '#12345', 'rgb(1,2,3)', '#GGGGGG']) {
      expect(resolvePortalAccent('garage', stored)).toBe('#FFD60A')
    }
  })
})

describe('the ink on the accent', () => {
  it('is white on a dark colour and near-black on a light one', () => {
    expect(onAccentFor('#C2410C')).toBe(ON_ACCENT_LIGHT)
    expect(onAccentFor('#0F4C3A')).toBe(ON_ACCENT_LIGHT)
    expect(onAccentFor('#1D4ED8')).toBe(ON_ACCENT_LIGHT)
    expect(onAccentFor('#FFD60A')).toBe(ON_ACCENT_DARK)
    expect(onAccentFor('#FFFFFF')).toBe(ON_ACCENT_DARK)
    expect(onAccentFor('#000000')).toBe(ON_ACCENT_LIGHT)
  })

  it('is always the better of the two, and readable, whatever the workshop picks', () => {
    const picks = ['#FF0000', '#00FF00', '#0000FF', '#808080', '#FF8A4C', '#7C3AED', '#14B8A6']
    for (const accent of [...picks, ...Object.values(PORTAL_THEME_ACCENTS)]) {
      const chosen = contrastRatio(accent, onAccentFor(accent))
      const other = contrastRatio(
        accent,
        onAccentFor(accent) === ON_ACCENT_LIGHT ? ON_ACCENT_DARK : ON_ACCENT_LIGHT
      )
      expect(chosen, accent).toBeGreaterThanOrEqual(other)
      expect(chosen, accent).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('is white for something that is not a colour', () => {
    expect(onAccentFor('tomato')).toBe(ON_ACCENT_LIGHT)
  })

  it('measures contrast as WCAG does', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#FFFFFF', '#FFFFFF')).toBe(1)
  })
})

describe('a portal nobody has styled', () => {
  it('is daylight in its own orange, with chat on and no tyres', () => {
    expect(DEFAULT_PORTAL_LOOK).toEqual({
      theme: 'daylight',
      accent: '#C2410C',
      onAccent: '#FFFFFF',
      coverUrl: null,
      logoUrl: null,
      messagesEnabled: true,
      showTires: false,
    })
  })

  it('puts the theme and both colours on the element that carries them', () => {
    expect(portalThemeProps({ theme: 'garage', accent: '#FFD60A', onAccent: '#0C0D0E' })).toEqual({
      'data-portal-theme': 'garage',
      style: { '--p-accent': '#FFD60A', '--p-on-accent': '#0C0D0E' },
    })
  })
})
