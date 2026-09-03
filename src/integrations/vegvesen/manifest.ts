import { INSPECTION_MANIFEST } from '@/features/integrations/Lib/inspection-sync'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Statens vegvesen, the Norwegian road authority, and its open lookup of
 * technical vehicle data by plate or VIN.
 *
 * The key is the workshop's own: Vegvesen issues one per applicant, ordered
 * on "Din side" with a Norwegian electronic ID, and the terms speak of a key
 * holder rather than a platform acting for many. No owner data comes back,
 * only the vehicle, which is what the form needs.
 */
export const manifest: ConnectorManifest = {
  id: 'vegvesen',
  name: 'Statens vegvesen',
  category: 'registry',
  countries: ['NO'],
  logo: '/images/integrations/vegvesen.svg',
  docs: '/docs/integrations/vegvesen',
  auth: {
    type: 'api-key',
    fields: [
      { key: 'apiKey', label: 'apiKey', type: 'password', required: true, help: 'apiKeyHelp' },
    ],
  },
  capabilities: ['vehicle.lookup', INSPECTION_MANIFEST.capability],
  settings: [INSPECTION_MANIFEST.setting],
  schedules: [INSPECTION_MANIFEST.schedule],
}
