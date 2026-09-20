/**
 * What the app tells its own screens, and who hears it.
 *
 * Every live update in the app used to be its own arrangement: a writer
 * emitted a shape it invented, a page listened for the shape it happened to
 * know, and anything written later was silently not live. A technician
 * marking a job complete moved nothing on the desk, because the phone sent
 * `job_updated` and the only listener was looking for `job_status_changed`.
 *
 * So there is one fact on the wire: *this record changed*. It carries ids and
 * nothing else. The screen that cares re-reads the record through the same
 * action it would use on a page load, which keeps permissions where they are
 * enforced already and keeps a field somebody may not see off the socket.
 *
 * Delivery is by room. A tab subscribes to the records it is showing, the
 * server checks each room belongs to that tab's workshop before joining it,
 * and an event reaches only the sockets in the room. A desk on one work order
 * never receives another's traffic.
 *
 * This file is the contract only: no server imports, so the browser and the
 * server agree by reading the same types.
 */

/** Records a screen can follow. The string is on the wire; keep it stable. */
export const RECORD_KINDS = [
  'serviceRecord',
  'inspection',
  'quote',
  'vehicle',
  'customer',
  'inventoryPart',
  'tireSet',
] as const

export type RecordKind = (typeof RECORD_KINDS)[number]

export function isRecordKind(value: unknown): value is RecordKind {
  return typeof value === 'string' && (RECORD_KINDS as readonly string[]).includes(value)
}

export type RecordAction = 'created' | 'updated' | 'deleted'

/** Who made the change, for the "edited by" line and for ignoring your own. */
export interface ChangeAuthor {
  userId: string | null
  name: string | null
  /** Where the change came from, so a page can say "from the app". */
  source: 'web' | 'app' | 'system'
}

export interface RecordChange {
  kind: RecordKind
  /**
   * The record that changed, or null when a write touched several at once
   * (a bulk update names a filter, not rows). A null goes to the workshop
   * room only, where a list re-reads itself; a record's own page is told by
   * its own id and is never woken by somebody else's bulk write.
   */
  id: string | null
  organizationId: string
  action: RecordAction
  by: ChangeAuthor
  /** Epoch millis, for dropping a frame that arrives after a newer read. */
  at: number
  /**
   * What changed, when the writer knows: 'labor', 'status', 'attachments'.
   * Only ever a hint for how loudly to react; a screen that does not
   * recognise it re-reads the record as it would for any other change.
   */
  hint?: string
}

/* ---------------------------------------------------------------- rooms -- */

/** Everything in one workshop: for pages that watch a list, not a record. */
export function orgRoom(organizationId: string): string {
  return `org:${organizationId}`
}

/** One record: what a work order page and its presence chips subscribe to. */
export function recordRoom(kind: RecordKind, id: string): string {
  return `rec:${kind}:${id}`
}

export function parseRecordRoom(room: string): { kind: RecordKind; id: string } | null {
  const parts = room.split(':')
  if (parts.length !== 3 || parts[0] !== 'rec') return null
  if (!isRecordKind(parts[1]) || !parts[2]) return null
  return { kind: parts[1], id: parts[2] }
}

export function parseOrgRoom(room: string): string | null {
  const parts = room.split(':')
  return parts.length === 2 && parts[0] === 'org' && parts[1] ? parts[1] : null
}

/* ------------------------------------------------------------- presence -- */

/**
 * Somebody else on the same record.
 *
 * Presence is ephemeral: it lives in memory for as long as a socket does and
 * is never written down. One person with the work order open on a laptop and
 * a phone is one chip, with `devices` saying how many, the way Phoenix's
 * presence and every chat app treat multiple sessions.
 */
export interface PresenceUser {
  userId: string
  name: string
  /** Stable per user, so the same person is the same colour on every screen. */
  color: string
  devices: number
}

/** Eight colours that read clearly on both themes, picked by user id. */
const PRESENCE_COLORS = [
  '#2563eb',
  '#db2777',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#0891b2',
  '#dc2626',
  '#4d7c0f',
]

export function presenceColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]
}

/* -------------------------------------------------------------- the wire -- */

/** What a browser sends. Anything else is ignored rather than answered. */
export type ClientMessage =
  | { t: 'sub'; rooms: string[] }
  | { t: 'unsub'; rooms: string[] }
  /** Join the room's presence, so other people see the chip. */
  | { t: 'enter'; room: string }
  | { t: 'leave'; room: string }
  | { t: 'ping' }

/** What the server sends. */
export type ServerMessage =
  | { t: 'ready'; you: { userId: string; name: string; color: string } }
  /** The rooms this socket is now in, after a sub: what was refused is absent. */
  | { t: 'subscribed'; rooms: string[] }
  | { t: 'record'; change: RecordChange }
  | { t: 'presence'; room: string; users: PresenceUser[] }
  | { t: 'pong' }
  /** The old org-wide channels, until every page has moved to rooms. */
  | { t: 'legacy'; channel: 'notification' | 'workboard' | 'broadcast'; data: unknown }

export const REALTIME_PATH = '/api/protected/ws'

/** How often a browser says it is still there, and when the server gives up. */
export const PRESENCE_HEARTBEAT_MS = 20_000
export const PRESENCE_TTL_MS = 55_000
