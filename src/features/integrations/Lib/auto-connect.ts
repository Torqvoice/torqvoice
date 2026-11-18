import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { getManifest, listManifests } from '@/integrations/registry'
import { isUniqueViolation, writeAdoptionMarker } from './adoption-marker'
import { connectorAllowed } from './plan'
import type { ConnectorManifest } from './types'
import { sealCredentials } from './vault'

/**
 * Connectors that are on for every workshop: a service Torqvoice runs and
 * pays for, such as Torqvoice Codes on the cloud. The first page that asks
 * for one creates the connection, with nothing in it but the server's key,
 * and from then on it is an ordinary connection the workshop can open,
 * check and disconnect.
 *
 * A disconnect has to stick, or the next page load would connect it again.
 * `disconnectIntegration` writes a marker for these connectors, and a
 * workshop with the marker is never connected again by this file; it can
 * still connect by hand from the catalog.
 */

/** Who a connection made here is recorded as created by. */
export const AUTO_CONNECT_ACTOR = 'system'

/** The setting that says this workshop turned the connector off. */
export function autoConnectOptOutKey(connectorId: string): string {
  return `integrations.${connectorId}.optedOutAt`
}

/**
 * Whether there is anything left for the workshop to type. The manifest is
 * the one the registry hands out, so a key the server holds is already
 * gone from it or optional; a field still required means the server holds
 * no key, and the workshop would have to connect by hand.
 */
export function readyToAutoConnect(manifest: ConnectorManifest): boolean {
  if (!manifest.autoConnect || manifest.auth.type !== 'api-key') return false
  return manifest.auth.fields.every((f) => !f.required)
}

/**
 * Connect one connector for a workshop if it should be on and is not. True
 * when a connection now exists that this call or a parallel one created.
 */
export async function autoConnect(organizationId: string, connectorId: string): Promise<boolean> {
  const manifest = getManifest(connectorId)
  if (!manifest || !readyToAutoConnect(manifest)) return false
  const [features, existing, optedOut] = await Promise.all([
    getFeatures(organizationId),
    db.integrationConnection.findUnique({
      where: { organizationId_connectorId: { organizationId, connectorId } },
      select: { id: true },
    }),
    db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: autoConnectOptOutKey(connectorId) } },
      select: { id: true },
    }),
  ])
  // A row of any status is the workshop's: connected by hand, waiting on a
  // key, or in error. None of those is written over.
  if (existing || optedOut) return false
  // A plan without it is asked again later: an upgrade turns it on.
  if (!connectorAllowed(manifest, features)) return false
  try {
    await db.integrationConnection.create({
      data: {
        organizationId,
        connectorId,
        status: 'active',
        credentials: sealCredentials({}),
        createdById: AUTO_CONNECT_ACTOR,
        label: 'Connected by Torqvoice',
      },
    })
  } catch (err) {
    // Two pages of the same workshop can land here at once; the loser uses the winner's row.
    if (!isUniqueViolation(err)) throw err
  }
  return true
}

/** Every auto-connect connector with the capability asked for. True when any was connected. */
export async function autoConnectFor(organizationId: string, capability: string): Promise<boolean> {
  const ids = listManifests()
    .filter((m) => m.autoConnect && m.capabilities.includes(capability))
    .map((m) => m.id)
  const done = await Promise.all(ids.map((id) => autoConnect(organizationId, id)))
  return done.some(Boolean)
}

/** Every auto-connect connector, for the catalog, so it opens with them under Connected. */
export async function autoConnectAll(organizationId: string): Promise<void> {
  const ids = listManifests()
    .filter((m) => m.autoConnect)
    .map((m) => m.id)
  await Promise.all(ids.map((id) => autoConnect(organizationId, id)))
}

/** Called by a disconnect: the workshop said no, so it is not connected again. */
export async function markAutoConnectOptOut(
  organizationId: string,
  connectorId: string,
  userId: string
): Promise<void> {
  if (!getManifest(connectorId)?.autoConnect) return
  await writeAdoptionMarker(organizationId, autoConnectOptOutKey(connectorId), userId)
}
