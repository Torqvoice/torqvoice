import type { PlanFeatures } from '@/lib/features'

/**
 * Every settings page, in the order the settings sidebar draws them.
 *
 * One list, read by the sidebar, the search palette and the settings search
 * box, so a page added here is reachable from all three at once. Titles and
 * descriptions are `settings.nav.items.<key>.title` / `.description`, which
 * exist in every locale already.
 */
export type SettingsPageKey =
  | 'company'
  | 'subscription'
  | 'account'
  | 'team'
  | 'localization'
  | 'appearance'
  | 'support'
  | 'invoice'
  | 'templates'
  | 'payment'
  | 'tax'
  | 'warranty'
  | 'emailTemplates'
  | 'customerPortal'
  | 'workshop'
  | 'workOrderStatuses'
  | 'maintenance'
  | 'inspectionReminders'
  | 'alerts'
  | 'tireHotel'
  | 'reportSchedule'
  | 'integrations'
  | 'webhooks'
  | 'data'
  | 'install'
  | 'license'
  | 'about'

export type SettingsCategoryKey =
  | 'general'
  | 'billing'
  | 'communications'
  | 'workshop'
  | 'integrations'
  | 'system'

export type SettingsPage = {
  key: SettingsPageKey
  href: string
  category: SettingsCategoryKey
  /** Plan feature the page needs; shown locked (not hidden) without it. */
  gate?: keyof PlanFeatures
  cloudOnly?: boolean
  selfHostedOnly?: boolean
  /**
   * Hidden unless the platform has switched support requests on. Implies cloud
   * already, since the flag is only ever true in cloud mode.
   */
  supportOnly?: boolean
}

export const SETTINGS_CATEGORIES: SettingsCategoryKey[] = [
  'general',
  'billing',
  'communications',
  'workshop',
  'integrations',
  'system',
]

export const SETTINGS_PAGES: SettingsPage[] = [
  { key: 'company', href: '/settings/company', category: 'general' },
  { key: 'subscription', href: '/settings/subscription', category: 'general', cloudOnly: true },
  { key: 'account', href: '/settings/account', category: 'general' },
  { key: 'team', href: '/settings/team', category: 'general' },
  { key: 'localization', href: '/settings/localization', category: 'general' },
  { key: 'appearance', href: '/settings/appearance', category: 'general' },
  { key: 'support', href: '/settings/support', category: 'general', supportOnly: true },

  { key: 'invoice', href: '/settings/invoice', category: 'billing' },
  { key: 'templates', href: '/settings/templates', category: 'billing', gate: 'customTemplates' },
  { key: 'payment', href: '/settings/payment', category: 'billing', gate: 'payments' },
  { key: 'tax', href: '/settings/tax', category: 'billing' },
  { key: 'warranty', href: '/settings/warranty', category: 'billing' },

  {
    key: 'emailTemplates',
    href: '/settings/email-templates',
    category: 'communications',
    gate: 'customTemplates',
  },
  {
    key: 'customerPortal',
    href: '/settings/customer-portal',
    category: 'communications',
    gate: 'customerPortal',
  },

  { key: 'workshop', href: '/settings/workshop', category: 'workshop' },
  { key: 'workOrderStatuses', href: '/settings/work-order-statuses', category: 'workshop' },
  { key: 'maintenance', href: '/settings/maintenance', category: 'workshop' },
  { key: 'inspectionReminders', href: '/settings/inspection-reminders', category: 'workshop' },
  { key: 'alerts', href: '/settings/alerts', category: 'workshop' },
  { key: 'tireHotel', href: '/settings/tire-hotel', category: 'workshop', gate: 'tireHotel' },
  {
    key: 'reportSchedule',
    href: '/settings/report-schedule',
    category: 'workshop',
    gate: 'reports',
  },

  { key: 'integrations', href: '/settings/integrations', category: 'integrations' },
  { key: 'webhooks', href: '/settings/webhooks', category: 'integrations', gate: 'api' },

  { key: 'data', href: '/settings/data', category: 'system' },
  { key: 'install', href: '/settings/install', category: 'system' },
  { key: 'license', href: '/settings/license', category: 'system', selfHostedOnly: true },
  { key: 'about', href: '/settings/about', category: 'system' },
]

/** What decides whether a page is on this install at all. */
export type SettingsVisibility = {
  isCloud?: boolean
  supportEnabled?: boolean
}

/** Pages that exist on this install, in sidebar order. Gated pages stay (they show as locked). */
export function visibleSettingsPages(v: SettingsVisibility): SettingsPage[] {
  return SETTINGS_PAGES.filter((page) => {
    if (page.cloudOnly && !v.isCloud) return false
    if (page.selfHostedOnly && v.isCloud) return false
    if (page.supportOnly && !v.supportEnabled) return false
    return true
  })
}

export function settingsPage(key: SettingsPageKey): SettingsPage {
  const page = SETTINGS_PAGES.find((p) => p.key === key)
  if (!page) throw new Error(`Unknown settings page: ${key}`)
  return page
}
