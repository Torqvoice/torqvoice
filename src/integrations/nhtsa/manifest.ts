import { SAFETY_MANIFEST } from '@/features/integrations/Lib/vehicle-safety-contract'
import type { ConnectorManifest } from '@/features/integrations/Lib/types'

/**
 * NHTSA, the US National Highway Traffic Safety Administration, and the
 * data it publishes free and without a key: the vPIC VIN decoder, every
 * recall campaign, every owner complaint filed, and the NCAP crash ratings.
 *
 * Two things for a workshop. A VIN fills the vehicle form, for any make sold
 * in the US and most sold elsewhere, since the decoder knows the world's
 * manufacturer codes. And a vehicle page shows what is known about that
 * model year: open recalls, what owners complain about most, and how it
 * scored in crash tests. No plate lookup: NHTSA holds no registrations.
 */
export const manifest: ConnectorManifest = {
  id: 'nhtsa',
  name: 'NHTSA (USA)',
  category: 'registry',
  countries: ['US'],
  logo: '/images/integrations/nhtsa.svg',
  docs: '/docs/integrations/nhtsa',
  auth: { type: 'api-key', fields: [] },
  capabilities: ['vehicle.lookup', SAFETY_MANIFEST.capability],
  settings: [SAFETY_MANIFEST.setting],
  subscriptions: SAFETY_MANIFEST.subscriptions,
  schedules: [SAFETY_MANIFEST.schedule],
}
