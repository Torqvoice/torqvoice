import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Openapi.com's Automotive API: technical vehicle data by plate for France,
 * Italy, Spain, Portugal and the United Kingdom, from each country's
 * registration data through one token and one response shape.
 *
 * The token is the workshop's own, bought on console.openapi.com and billed
 * per lookup, so the platform never carries a bill it cannot attribute. The
 * plate formats of France and Italy are identical, so the country cannot be
 * read off the plate and is a setting instead. No owner data comes back.
 */
export const manifest: ConnectorManifest = {
  id: 'openapi-automotive',
  name: 'Openapi Automotive',
  category: 'registry',
  countries: ['FR', 'IT', 'ES', 'PT', 'GB'],
  logo: '/images/integrations/openapi-automotive.svg',
  docs: '/docs/integrations/openapi-automotive',
  auth: {
    type: 'api-key',
    fields: [{ key: 'token', label: 'token', type: 'password', required: true, help: 'tokenHelp' }],
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
        { value: 'FR', label: 'France' },
        { value: 'IT', label: 'Italia' },
        { value: 'ES', label: 'España' },
        { value: 'PT', label: 'Portugal' },
        { value: 'GB', label: 'United Kingdom' },
      ],
    },
    {
      key: 'bikes',
      type: 'boolean',
      label: 'bikes',
      help: 'bikesHelp',
      default: false,
    },
  ],
}
