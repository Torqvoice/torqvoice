import type { SettingsEntry } from './types'

/** Support: the support button's visibility and a way to open the form. */
export const supportEntries: SettingsEntry[] = [
  {
    id: 'support.settings',
    page: 'support',
    title: 'support.title',
    description: 'support.description',
    anchor: 'support-settings',
    keywords: ['support', 'help', 'contact support', 'customer service', 'helpdesk'],
  },
  {
    id: 'support.showButton',
    page: 'support',
    title: 'support.showButton',
    description: 'support.showButtonHint',
    anchor: 'support-visible',
    keywords: ['support button', 'help button', 'hide support', 'show support', 'chat bubble'],
  },
  {
    id: 'support.contact',
    page: 'support',
    title: 'support.contactTitle',
    description: 'support.contactHint',
    anchor: 'support-contact',
    keywords: ['contact support', 'support form', 'report a bug', 'ask for help', 'feedback'],
  },
]
