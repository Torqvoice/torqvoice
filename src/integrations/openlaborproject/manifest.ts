import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Open Labor Project: book times and fluid capacities for US-market
 * vehicles, through the workshop's own API key. Nothing runs in the
 * background; a lookup happens when somebody opens the labor guide on a work
 * order or a quote.
 */
export const manifest: ConnectorManifest = {
  id: 'openlaborproject',
  name: 'Open Labor Project',
  category: 'repair',
  countries: ['US', 'CA'],
  logo: '/images/integrations/openlaborproject.svg',
  docs: '/docs/integrations/openlaborproject',
  auth: {
    type: 'api-key',
    fields: [
      { key: 'apiKey', label: 'apiKey', type: 'password', required: true, help: 'apiKeyHelp' },
    ],
  },
  capabilities: ['repair.labor', 'repair.fluids'],
  settings: [],
}
