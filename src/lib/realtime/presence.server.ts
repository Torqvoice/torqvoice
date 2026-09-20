import 'server-only'

import { INSTANCE_ID, onBusMessage, publishToBus } from './bus.server'
import { PRESENCE_TTL_MS, type PresenceUser, presenceColor } from './events'
import { shared } from './shared-state.server'

/**
 * Who else is on this record, right now.
 *
 * Ephemeral by design: it lives in these maps for as long as a socket does
 * and is never written to the database. Nothing is lost when a process
 * restarts, because every browser announces itself again the moment its
 * socket reconnects.
 *
 * Two halves make a workshop's answer:
 *
 * - **Local**: the sockets on this instance, keyed by the socket itself.
 * - **Remote**: what other instances say about the same room, each entry
 *   stamped with an expiry. An instance that dies stops re-announcing and its
 *   people fade out of the chips a minute later, rather than haunting the
 *   room forever. That is the same heartbeat-and-evict arrangement Phoenix's
 *   presence uses, and it is why no cleanup message is required on a crash.
 *
 * Every map entry is deleted the moment it empties: a room only exists while
 * somebody is in it.
 */

export interface PresenceIdentity {
  userId: string
  name: string
}

type LocalEntry = PresenceIdentity

interface RemoteEntry {
  users: PresenceUser[]
  expiresAt: number
}

type Socket = object

const local = shared('presence.local', () => new Map<string, Map<Socket, LocalEntry>>())
/**
 * The same membership from the socket's side, so a closing socket is taken
 * out of exactly the rooms it stood in. Without it, every close walked every
 * occupied room in the process, which is the cost that grows with the number
 * of workshops rather than with what one person had open.
 */
const roomsBySocket = shared('presence.bySocket', () => new Map<Socket, Set<string>>())
const remote = shared('presence.remote', () => new Map<string, Map<string, RemoteEntry>>())
const watchers = shared(
  'presence.watchers',
  () => new Set<(room: string, users: PresenceUser[]) => void>()
)

/** Told when a room's occupants change, so the socket route can send them. */
export function onPresenceChange(
  handler: (room: string, users: PresenceUser[]) => void
): () => void {
  watchers.add(handler)
  return () => {
    watchers.delete(handler)
  }
}

/** Somebody opened the record. Idempotent: a second call just refreshes it. */
export function enterRoom(room: string, socket: Socket, who: PresenceIdentity): void {
  const occupants = local.get(room) ?? new Map<Socket, LocalEntry>()
  occupants.set(socket, { ...who })
  local.set(room, occupants)
  const held = roomsBySocket.get(socket) ?? new Set<string>()
  held.add(room)
  roomsBySocket.set(socket, held)
  announce(room)
}

/** Somebody closed it, or left the page. */
export function leaveRoom(room: string, socket: Socket): void {
  const occupants = local.get(room)
  if (!occupants?.delete(socket)) return
  if (occupants.size === 0) local.delete(room)
  const held = roomsBySocket.get(socket)
  if (held) {
    held.delete(room)
    if (held.size === 0) roomsBySocket.delete(socket)
  }
  announce(room)
}

/** Every room a closing socket was in, and only those. */
export function leaveAllRooms(socket: Socket): void {
  const held = roomsBySocket.get(socket)
  if (!held) return
  roomsBySocket.delete(socket)
  for (const room of held) {
    const occupants = local.get(room)
    if (!occupants?.delete(socket)) continue
    if (occupants.size === 0) local.delete(room)
    announce(room)
  }
}

/** What this instance would show for a room: its own people and everyone else's. */
export function presenceOf(room: string): PresenceUser[] {
  const merged = new Map<string, PresenceUser>()
  for (const user of [...ownUsers(room), ...remoteUsers(room)]) {
    const already = merged.get(user.userId)
    if (!already) {
      merged.set(user.userId, { ...user })
      continue
    }
    // The same person on a laptop and a phone is one chip.
    already.devices += user.devices
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** This instance's own occupants, folded per person. */
function ownUsers(room: string): PresenceUser[] {
  const occupants = local.get(room)
  if (!occupants) return []
  const byUser = new Map<string, PresenceUser>()
  for (const entry of occupants.values()) {
    const already = byUser.get(entry.userId)
    if (already) {
      already.devices += 1
      continue
    }
    byUser.set(entry.userId, {
      userId: entry.userId,
      name: entry.name,
      color: presenceColor(entry.userId),
      devices: 1,
    })
  }
  return [...byUser.values()]
}

function remoteUsers(room: string): PresenceUser[] {
  const instances = remote.get(room)
  if (!instances) return []
  const now = Date.now()
  const users: PresenceUser[] = []
  for (const [instanceId, entry] of instances) {
    if (entry.expiresAt <= now) {
      instances.delete(instanceId)
      continue
    }
    users.push(...entry.users)
  }
  if (instances.size === 0) remote.delete(room)
  return users
}

/**
 * Tells this instance's watchers, and the other instances.
 *
 * Gathered for a moment first. Tabbing from one field to the next is a blur
 * and a focus a millisecond apart, and a page opening is an enter and a focus:
 * each would otherwise be its own frame to everybody in the room. One room,
 * one frame per tick, carrying where things ended up.
 */
const ANNOUNCE_AFTER_MS = 25
const dirty = shared('presence.dirty', () => new Set<string>())
const announcer = shared('presence.announcer', () => ({
  timer: null as ReturnType<typeof setTimeout> | null,
}))

function announce(room: string): void {
  dirty.add(room)
  if (announcer.timer) return
  announcer.timer = setTimeout(flushPresence, ANNOUNCE_AFTER_MS)
  announcer.timer.unref?.()
}

/** Sends what is waiting at once. The timer calls it; so do the tests. */
export function flushPresence(): void {
  if (announcer.timer) clearTimeout(announcer.timer)
  announcer.timer = null
  const rooms = [...dirty]
  dirty.clear()
  for (const room of rooms) {
    const users = presenceOf(room)
    for (const watcher of watchers) watcher(room, users)
    publishToBus({
      t: 'presence',
      room,
      instanceId: INSTANCE_ID,
      users: ownUsers(room),
      ttlMs: PRESENCE_TTL_MS,
    })
  }
}

/**
 * Another instance's view of a room. Called by the bridge below, and directly
 * by the tests, which have no second process to send from.
 */
export function acceptRemotePresence(
  room: string,
  users: PresenceUser[],
  ttlMs: number,
  from: string
): void {
  const instances = remote.get(room) ?? new Map<string, RemoteEntry>()
  // Every instance repeats what it holds twice a minute so the others do not
  // expire it. A repeat that says nothing new only renews the lease: telling
  // the room again would be a frame to every viewer, for ever, about nothing.
  const known = instances.get(from)
  if (known && users.length > 0 && sameUsers(known.users, users)) {
    known.expiresAt = Date.now() + ttlMs
    return
  }
  if (!known && users.length === 0) return
  if (users.length === 0) {
    instances.delete(from)
    if (instances.size === 0) remote.delete(room)
    else remote.set(room, instances)
  } else {
    instances.set(from, { users, expiresAt: Date.now() + ttlMs })
    remote.set(room, instances)
  }
  const merged = presenceOf(room)
  for (const watcher of watchers) watcher(room, merged)
}

function sameUsers(a: PresenceUser[], b: PresenceUser[]): boolean {
  if (a.length !== b.length) return false
  return a.every((user, i) => {
    const other = b[i]
    return (
      user.userId === other.userId && user.name === other.name && user.devices === other.devices
    )
  })
}

/**
 * Re-announcing and sweeping.
 *
 * Every instance repeats what it holds well inside the others' expiry, so a
 * room stays populated while people sit on it; and a sweep drops whatever has
 * gone stale, which is what removes an instance that died without saying
 * goodbye. Both run on one timer, unref'd so it never holds the process open.
 */
const REPEAT_MS = Math.floor(PRESENCE_TTL_MS / 2)

const globalForPresence = globalThis as unknown as {
  torqvoicePresenceTimer?: ReturnType<typeof setInterval>
  torqvoicePresenceBridge?: () => void
}

export function startPresence(): void {
  // Whoever calls this last owns the bridge and the timer: the previous ones
  // are taken down first, so a reloaded module never leaves its predecessor's
  // code running on a timer beside it, and there is only ever one of each.
  globalForPresence.torqvoicePresenceBridge?.()
  if (globalForPresence.torqvoicePresenceTimer) {
    clearInterval(globalForPresence.torqvoicePresenceTimer)
  }
  globalForPresence.torqvoicePresenceBridge = onBusMessage((message) => {
    if (message.t !== 'presence') return
    // Our own snapshot comes back through the local emitter; it is already
    // in `local`, and counting it again would double every chip.
    if (message.instanceId === INSTANCE_ID) return
    acceptRemotePresence(message.room, message.users, message.ttlMs, message.instanceId)
  })
  const timer = setInterval(() => {
    for (const room of [...local.keys()]) {
      publishToBus({
        t: 'presence',
        room,
        instanceId: INSTANCE_ID,
        users: ownUsers(room),
        ttlMs: PRESENCE_TTL_MS,
      })
    }
    sweep()
  }, REPEAT_MS)
  timer.unref?.()
  globalForPresence.torqvoicePresenceTimer = timer
}

/** Drops expired remote entries and any room that is now empty. */
export function sweep(now: number = Date.now()): void {
  for (const [room, instances] of [...remote]) {
    let expired = false
    for (const [instanceId, entry] of [...instances]) {
      if (entry.expiresAt > now) continue
      instances.delete(instanceId)
      expired = true
    }
    if (instances.size === 0) remote.delete(room)
    // An instance that died never said goodbye: the people it held leave the
    // chips here, rather than staying until somebody else happens to move.
    if (expired) {
      const users = presenceOf(room)
      for (const watcher of watchers) watcher(room, users)
    }
  }
  for (const [room, occupants] of [...local]) {
    if (occupants.size === 0) local.delete(room)
  }
}

/** What is held right now: the tests read this to prove nothing leaks. */
export function presenceStats(): {
  localRooms: number
  remoteRooms: number
  sockets: number
  indexedSockets: number
  waiting: number
} {
  const sockets = new Set<Socket>()
  for (const occupants of local.values()) for (const socket of occupants.keys()) sockets.add(socket)
  return {
    localRooms: local.size,
    remoteRooms: remote.size,
    sockets: sockets.size,
    indexedSockets: roomsBySocket.size,
    waiting: dirty.size,
  }
}

/** Only for tests. */
export function resetPresence(): void {
  local.clear()
  roomsBySocket.clear()
  remote.clear()
  watchers.clear()
  dirty.clear()
  if (announcer.timer) clearTimeout(announcer.timer)
  announcer.timer = null
}
