import type { SettingsEntry } from './types'

/** License (self-hosted only): the white-label card and its key field. */
export const licenseEntries: SettingsEntry[] = [
  {
    id: 'license.whiteLabel',
    page: 'license',
    title: 'license.title',
    description: 'license.description',
    anchor: 'license-white-label',
    keywords: ['white label', 'white-label', 'license', 'licence', 'remove branding', 'branding'],
  },
  {
    id: 'license.key',
    page: 'license',
    title: 'license.enterLicenseKey',
    description: 'license.keyHint',
    anchor: 'license-key',
    keywords: [
      'license key',
      'licence key',
      'activate license',
      'validate license',
      'serial',
      'product key',
    ],
  },
  {
    id: 'license.status',
    page: 'license',
    title: 'license.validate',
    description: 'license.signedHint',
    anchor: 'license-status',
    keywords: ['license status', 'expired license', 'last checked', 'verify license', 'expires'],
  },
  {
    id: 'license.purchase',
    page: 'license',
    title: 'license.purchaseWhiteLabel',
    anchor: 'license-purchase',
    keywords: ['buy license', 'purchase license', 'white label price', 'upgrade'],
  },
]
