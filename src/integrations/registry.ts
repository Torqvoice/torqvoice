/**
 * Every connector the app ships.
 *
 * Manifests are imported eagerly: they are small data and the catalog needs
 * all of them. Server modules are imported lazily by id, so a connector's
 * code is loaded only when one of its jobs runs. A test checks that every
 * folder under src/integrations with a manifest is listed here.
 */

import type { ConnectorManifest, ConnectorServer } from '@/features/integrations/Lib/types'
import { manifest as googleCalendar } from './google-calendar/manifest'
import { manifest as microsoft365 } from './microsoft-365/manifest'

interface RegistryEntry {
  manifest: ConnectorManifest
  load: () => Promise<{ connector: ConnectorServer }>
}

const ENTRIES: readonly RegistryEntry[] = [
  { manifest: googleCalendar, load: () => import('./google-calendar/server') },
  { manifest: microsoft365, load: () => import('./microsoft-365/server') },
]

const BY_ID = new Map(ENTRIES.map((e) => [e.manifest.id, e]))

export function listManifests(): ConnectorManifest[] {
  return ENTRIES.map((e) => e.manifest)
}

export function getManifest(id: string): ConnectorManifest | null {
  return BY_ID.get(id)?.manifest ?? null
}

export async function getConnector(id: string): Promise<ConnectorServer> {
  const entry = BY_ID.get(id)
  if (!entry) throw new Error(`Unknown connector ${id}`)
  const mod = await entry.load()
  return mod.connector
}
