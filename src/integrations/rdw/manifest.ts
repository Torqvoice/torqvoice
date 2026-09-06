import { INSPECTION_MANIFEST } from '@/features/integrations/Lib/inspection-sync'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * RDW, the Dutch vehicle authority, and its open data on every registered
 * vehicle: make, model, first registration, fuel, colour, weights and the
 * date the next APK inspection is due, by plate, free and without a key.
 *
 * The one optional credential is a Socrata app token from opendata.rdw.nl.
 * Anonymous requests share a throttled pool per address, so a workshop that
 * turns on the inspection sync is better off with a token of its own. No
 * owner data and no VIN come back: RDW keeps both out of the open data.
 */
export const manifest: ConnectorManifest = {
  id: 'rdw',
  name: 'RDW Open Data',
  category: 'registry',
  countries: ['NL'],
  logo: '/images/integrations/rdw.svg',
  docs: '/docs/integrations/rdw',
  auth: {
    type: 'api-key',
    fields: [{ key: 'appToken', label: 'appToken', type: 'password', help: 'appTokenHelp' }],
  },
  capabilities: ['vehicle.lookup', INSPECTION_MANIFEST.capability],
  settings: [INSPECTION_MANIFEST.setting],
  schedules: [INSPECTION_MANIFEST.schedule],
}
