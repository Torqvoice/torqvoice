import type { SettingsEntry } from './types'

/** Install app: the one card, and the switch back for a dismissed banner. */
export const installEntries: SettingsEntry[] = [
  {
    id: 'install.app',
    page: 'install',
    title: 'install.title',
    anchor: 'install-app',
    keywords: [
      'install app',
      'pwa',
      'home screen',
      'add to home screen',
      'desktop app',
      'mobile app',
      'add torqvoice to this device',
    ],
  },
  {
    id: 'install.showBanner',
    page: 'install',
    title: 'install.showBanner',
    description: 'install.bannerHidden',
    anchor: 'install-banner',
    keywords: ['install banner', 'show banner', 'install prompt', 'hidden banner'],
  },
]
