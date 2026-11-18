import type { SettingsEntry } from './types'

/** Maintenance. One card; the switch and inputs carry ids of their own. */
export const maintenanceEntries: SettingsEntry[] = [
  {
    id: 'maintenance.predicted',
    page: 'maintenance',
    title: 'maintenance.title',
    description: 'maintenance.description',
    anchor: 'maintenance-predicted',
    keywords: [
      'predicted maintenance',
      'service due',
      'mileage prediction',
      'service intervals',
      'due soon',
    ],
  },
  {
    id: 'maintenance.enabled',
    page: 'maintenance',
    title: 'maintenance.enablePredicted',
    description: 'maintenance.enablePredictedHint',
    anchor: 'maintenance-enabled',
    keywords: ['enable predicted maintenance', 'predictions', 'turn on maintenance'],
  },
  {
    id: 'maintenance.serviceInterval',
    page: 'maintenance',
    title: 'maintenance.serviceInterval',
    values: { unit: 'km / mi' },
    description: 'maintenance.serviceIntervalHint',
    anchor: 'serviceInterval',
    keywords: [
      'service interval',
      'oil change interval',
      'km between services',
      'miles between services',
    ],
  },
  {
    id: 'maintenance.approachingThreshold',
    page: 'maintenance',
    title: 'maintenance.approachingThreshold',
    values: { unit: 'km / mi' },
    description: 'maintenance.approachingThresholdHint',
    anchor: 'approachingThreshold',
    keywords: ['approaching threshold', 'due soon warning', 'service warning', 'reminder distance'],
  },
]
