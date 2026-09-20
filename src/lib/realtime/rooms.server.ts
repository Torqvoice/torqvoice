import 'server-only'

import { shared } from './shared-state.server'

/**
 * Which socket is in which room, and nothing else.
 *
 * A room is not an object with a lifetime: it is an entry in this map that
 * exists exactly as long as somebody is in it. The last socket to leave takes
 * the entry with it, because a workshop can open thousands of work orders in
 * a week and a server that keeps an empty room for each one has a leak that
 * only shows up in month three.
 *
 * Three rules keep that true:
 *
 * 1. `leave` deletes the entry when the set empties, rather than leaving an
 *    empty Set behind.
 * 2. Every socket's rooms are dropped in one call when it closes, and a
 *    socket that dies without a close event is dropped by the ping timeout
 *    that already terminates it.
 * 3. A socket may hold at most MAX_ROOMS_PER_SOCKET rooms, so a page with a
 *    bug, or a client someone wrote themselves, cannot grow the map without
 *    bound. It is far more than any real page needs.
 *
 * `stats()` is what the tests read to prove there is nothing left behind.
 */

export const MAX_ROOMS_PER_SOCKET = 50

/**
 * A room as the server keeps it: the workshop first, then the name the
 * browser knows it by.
 *
 * This is the second wall between workshops, and it does not depend on the
 * first. A socket may only join a room after `mayJoin` has checked the record
 * belongs to its workshop; but a check is code, and code has bugs. So the
 * key itself carries the workshop, taken from the socket's own session and
 * never from anything the browser sent. Workshop A's sockets can only ever
 * stand in rooms that begin with A, and a change in workshop B is only ever
 * sent to rooms that begin with B: there is no room the two could share,
 * whatever either of them asks for.
 */
const SEPARATOR = '|'

export function tenantRoom(organizationId: string, room: string): string {
  if (!organizationId || organizationId.includes(SEPARATOR)) {
    throw new Error('a room needs a workshop, and a workshop id has no separator in it')
  }
  return `${organizationId}${SEPARATOR}${room}`
}

export function parseTenantRoom(key: string): { organizationId: string; room: string } | null {
  const at = key.indexOf(SEPARATOR)
  if (at <= 0 || at === key.length - 1) return null
  return { organizationId: key.slice(0, at), room: key.slice(at + 1) }
}

/** Anything with an identity; the socket itself in production. */
export type Member = object

const members = shared('rooms.members', () => new Map<Member, Set<string>>())
const rooms = shared('rooms.rooms', () => new Map<string, Set<Member>>())

/** Adds a socket to a room. False when it is already holding its limit. */
export function join(member: Member, room: string): boolean {
  const held = members.get(member) ?? new Set<string>()
  if (!held.has(room) && held.size >= MAX_ROOMS_PER_SOCKET) return false
  held.add(room)
  members.set(member, held)

  const occupants = rooms.get(room) ?? new Set<Member>()
  occupants.add(member)
  rooms.set(room, occupants)
  return true
}

/** Removes a socket from one room, and the room when it was the last one. */
export function leave(member: Member, room: string): void {
  const held = members.get(member)
  if (held) {
    held.delete(room)
    if (held.size === 0) members.delete(member)
  }
  const occupants = rooms.get(room)
  if (!occupants) return
  occupants.delete(member)
  if (occupants.size === 0) rooms.delete(room)
}

/** Everything a socket was in, on its way out. Returns the rooms it held. */
export function leaveAll(member: Member): string[] {
  const held = members.get(member)
  if (!held) return []
  const left = [...held]
  for (const room of left) {
    const occupants = rooms.get(room)
    if (!occupants) continue
    occupants.delete(member)
    if (occupants.size === 0) rooms.delete(room)
  }
  members.delete(member)
  return left
}

export function roomsOf(member: Member): ReadonlySet<string> {
  return members.get(member) ?? new Set()
}

export function membersOf(room: string): ReadonlySet<Member> {
  return rooms.get(room) ?? new Set()
}

export function isInRoom(member: Member, room: string): boolean {
  return members.get(member)?.has(room) ?? false
}

/** Runs `send` for every socket in the room; no allocation when it is empty. */
export function broadcast(room: string, send: (member: Member) => void): number {
  const occupants = rooms.get(room)
  if (!occupants) return 0
  for (const member of occupants) send(member)
  return occupants.size
}

/** What is being held right now. For the tests, and for a health readout. */
export function stats(): { rooms: number; members: number; subscriptions: number } {
  let subscriptions = 0
  for (const held of members.values()) subscriptions += held.size
  return { rooms: rooms.size, members: members.size, subscriptions }
}

/** Only for tests: forget everything. */
export function resetRooms(): void {
  members.clear()
  rooms.clear()
}
