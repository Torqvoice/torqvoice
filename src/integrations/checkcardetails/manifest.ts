import { INSPECTION_MANIFEST } from '@/features/integrations/Lib/inspection-sync'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * Check Car Details: DVLA and DVSA data for a British plate or VIN, cars and
 * motorcycles from one register, through the workshop's own API key.
 *
 * Two of the vendor's data points are used. Vehicle Registration is on for
 * every account and gives make, model, colour, fuel, engine capacity and the
 * MOT due date. UK Vehicle Data adds the VIN, transmission and weights, but
 * an account has to ask the vendor to turn it on. There is no switch for it
 * here: every lookup asks for both, and an account without UK Vehicle Data
 * is refused that half at no charge. No owner data comes back from either.
 */
export const manifest: ConnectorManifest = {
  id: 'checkcardetails',
  name: 'Check Car Details',
  category: 'registry',
  countries: ['GB'],
  logo: '/images/integrations/checkcardetails.svg',
  docs: '/docs/integrations/checkcardetails',
  auth: {
    type: 'api-key',
    fields: [
      { key: 'apiKey', label: 'apiKey', type: 'password', required: true, help: 'apiKeyHelp' },
    ],
  },
  capabilities: ['vehicle.lookup', INSPECTION_MANIFEST.capability],
  lookupBy: ['plate', 'vin'],
  settings: INSPECTION_MANIFEST.settings,
  schedules: [INSPECTION_MANIFEST.schedule],
}
