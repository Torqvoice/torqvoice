import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * RegCheck, Infinite Loop Development's plate lookup covering some sixty
 * countries through one web service. Offered here for the countries the
 * app has no free or national registry for and whose answers the vendor
 * documents: Australia and New Zealand, the United States, Ireland, the
 * Nordics outside Norway, and central Europe.
 *
 * The account is the workshop's own: a username, with credits bought on the
 * vendor's site and spent per successful lookup. Australia and the United
 * States register vehicles per state, and the vendor needs the state named
 * on every call, so the workshop's own state is a setting. No owner data
 * comes back.
 */
export const AUSTRALIAN_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'] as const

export const manifest: ConnectorManifest = {
  id: 'regcheck',
  name: 'RegCheck',
  category: 'registry',
  countries: ['AU', 'NZ', 'US', 'IE', 'SE', 'DK', 'FI', 'EE', 'CZ', 'SK', 'HU', 'HR'],
  logo: '/images/integrations/regcheck.svg',
  docs: '/docs/integrations/regcheck',
  auth: {
    type: 'api-key',
    fields: [
      { key: 'username', label: 'username', type: 'text', required: true, help: 'usernameHelp' },
    ],
  },
  capabilities: ['vehicle.lookup'],
  settings: [
    {
      key: 'country',
      type: 'select',
      label: 'country',
      help: 'countryHelp',
      required: true,
      options: [
        { value: 'AU', label: 'Australia' },
        { value: 'NZ', label: 'New Zealand' },
        { value: 'US', label: 'United States' },
        { value: 'IE', label: 'Ireland' },
        { value: 'SE', label: 'Sverige' },
        { value: 'DK', label: 'Danmark' },
        { value: 'FI', label: 'Suomi' },
        { value: 'EE', label: 'Eesti' },
        { value: 'CZ', label: 'Česko' },
        { value: 'SK', label: 'Slovensko' },
        { value: 'HU', label: 'Magyarország' },
        { value: 'HR', label: 'Hrvatska' },
      ],
    },
    {
      key: 'auState',
      type: 'select',
      label: 'auState',
      help: 'auStateHelp',
      required: true,
      showWhen: { key: 'country', equals: 'AU' },
      options: AUSTRALIAN_STATES.map((s) => ({ value: s, label: s })),
    },
    {
      key: 'usState',
      type: 'text',
      label: 'usState',
      help: 'usStateHelp',
      required: true,
      showWhen: { key: 'country', equals: 'US' },
    },
  ],
}
