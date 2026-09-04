/**
 * Which connectors a plan reaches.
 *
 * A connector that names its own plan feature is gated by that feature alone.
 * AI is why: it came from a settings page that every plan with the `ai`
 * feature could open, the free one included, and moving it into the catalog
 * must not put it behind the `integrations` flag it never had. Everything
 * else is gated by `integrations`, as before.
 */

import type { PlanFeatures } from '@/lib/features'
import { listManifests } from '@/integrations/registry'
import type { ConnectorManifest } from './types'

export function connectorAllowed(manifest: ConnectorManifest, features: PlanFeatures): boolean {
  if (manifest.plan) return Boolean(features[manifest.plan])
  return features.integrations
}

/** Whether the catalog is worth opening at all on this plan. */
export function anyConnectorAllowed(features: PlanFeatures): boolean {
  if (features.integrations) return true
  return listManifests().some((m) => connectorAllowed(m, features))
}
