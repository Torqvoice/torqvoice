import type { SettingsEntry } from './types'

/** Appearance: theme and font, both kept on this device. */
export const appearanceEntries: SettingsEntry[] = [
  {
    id: 'appearance.theme',
    page: 'appearance',
    title: 'appearance.themeLabel',
    description: 'appearance.themeHint',
    anchor: 'appearance-theme',
    keywords: ['theme', 'dark mode', 'light mode', 'colour', 'color scheme', 'display'],
  },
  {
    id: 'appearance.font',
    page: 'appearance',
    title: 'appearance.fontLabel',
    description: 'appearance.fontHint',
    anchor: 'appearance-font',
    keywords: ['font', 'typeface', 'text size', 'typography', 'lettering'],
  },
]
