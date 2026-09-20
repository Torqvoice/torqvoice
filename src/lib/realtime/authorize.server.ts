import 'server-only'

import { db } from '@/lib/db'
import { parseOrgRoom, parseRecordRoom, type RecordKind } from './events'

/**
 * Whether a socket may join a room.
 *
 * The room name comes from the browser, so it is a request, never a fact. A
 * workshop room is granted only to its own members, and a record room only
 * when that record belongs to the socket's workshop. Without this, a room
 * name typed into a console would be a window onto another workshop's work,
 * which is the whole tenancy of the app undone by a string.
 *
 * Answers are remembered for a few minutes: a record does not change
 * workshop, and a page that subscribes on every navigation must not mean a
 * query each time.
 */

const WHERE: Record<RecordKind, (id: string, organizationId: string) => Promise<boolean>> = {
  serviceRecord: (id, organizationId) => exists('serviceRecord', id, organizationId),
  inspection: (id, organizationId) => exists('inspection', id, organizationId),
  quote: (id, organizationId) => exists('quote', id, organizationId),
  vehicle: (id, organizationId) => exists('vehicle', id, organizationId),
  customer: (id, organizationId) => exists('customer', id, organizationId),
  inventoryPart: (id, organizationId) => exists('inventoryPart', id, organizationId),
  tireSet: (id, organizationId) => exists('tireSet', id, organizationId),
}

async function exists(delegate: string, id: string, organizationId: string): Promise<boolean> {
  const model = (db as unknown as Record<string, unknown>)[delegate] as {
    count(args: unknown): Promise<number>
  }
  const found = await model.count({ where: { id, organizationId } })
  return found > 0
}

const TTL_MS = 5 * 60_000
const MAX_CACHED = 5_000
const answers = new Map<string, { allowed: boolean; expiresAt: number }>()

export async function mayJoin(room: string, socketOrganizationId: string): Promise<boolean> {
  const org = parseOrgRoom(room)
  // A workshop room is the socket's own membership, decided at sign-in.
  if (org) return org === socketOrganizationId

  const record = parseRecordRoom(room)
  if (!record) return false

  const key = `${socketOrganizationId}:${room}`
  const cached = answers.get(key)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.allowed

  const allowed = await WHERE[record.kind](record.id, socketOrganizationId).catch(() => false)
  if (answers.size >= MAX_CACHED) {
    const oldest = answers.keys().next().value
    if (oldest) answers.delete(oldest)
  }
  answers.set(key, { allowed, expiresAt: now + TTL_MS })
  return allowed
}

/** Only for tests. */
export function resetJoinCache(): void {
  answers.clear()
}
