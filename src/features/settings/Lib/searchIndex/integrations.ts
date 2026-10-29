import type { SettingsEntry } from './types'

/**
 * Integrations catalog. The cards and controls are labelled from the
 * `integrations` namespace, so the entries borrow the nav item's title and
 * description and carry the specific words as keywords. Individual
 * connectors are indexed from the registry, not here.
 */
export const integrationsEntries: SettingsEntry[] = [
  {
    id: 'integrations.connected',
    page: 'integrations',
    title: 'nav.items.integrations.title',
    description: 'nav.items.integrations.description',
    anchor: 'integrations-connected',
    keywords: [
      'connected',
      'connected services',
      'my integrations',
      'manage integration',
      'active integrations',
      'connected apps',
    ],
  },
  {
    id: 'integrations.available',
    page: 'integrations',
    title: 'nav.items.integrations.title',
    description: 'nav.items.integrations.description',
    anchor: 'integrations-available',
    keywords: [
      'available integrations',
      'add integration',
      'connect app',
      'app store',
      'marketplace',
      'catalog',
      'calendars',
      'video calls',
    ],
  },
  {
    id: 'integrations.search',
    page: 'integrations',
    title: 'nav.items.integrations.title',
    anchor: 'integrations-search',
    keywords: ['search integrations', 'find integration', 'find connector', 'connectors'],
  },
  {
    id: 'integrations.categories',
    page: 'integrations',
    title: 'nav.items.integrations.title',
    anchor: 'integrations-categories',
    keywords: [
      'integration categories',
      'accounting integration',
      'calendar integration',
      'payment integration',
      'messaging integration',
      'plate lookup',
      'registry',
    ],
  },
  {
    id: 'integrations.suggest',
    page: 'integrations',
    title: 'nav.items.integrations.title',
    anchor: 'integrations-suggest',
    keywords: [
      'suggest integration',
      'request integration',
      'missing integration',
      'new integration',
      'feature request',
    ],
  },
]
