import type { SettingsEntry } from './types'

/** About: the card, the version line and the outside links. */
export const aboutEntries: SettingsEntry[] = [
  {
    id: 'about.torqvoice',
    page: 'about',
    title: 'about.title',
    anchor: 'about-torqvoice',
    keywords: ['about', 'about torqvoice', 'info', 'website'],
  },
  {
    id: 'about.version',
    page: 'about',
    title: 'about.version',
    anchor: 'about-version',
    keywords: ['version', 'app version', 'build', 'release', 'which version'],
  },
  {
    id: 'about.changelog',
    page: 'about',
    title: 'about.changelog',
    anchor: 'about-links',
    keywords: ['changelog', 'release notes', "what's new", 'updates', 'new features'],
  },
  {
    id: 'about.documentation',
    page: 'about',
    title: 'about.documentation',
    anchor: 'about-links',
    keywords: ['documentation', 'docs', 'help', 'manual', 'user guide'],
  },
]
