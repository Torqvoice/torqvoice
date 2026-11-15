import 'server-only'

import { onBusMessage } from './bus.server'
import { PORTAL_THREAD_HINT, type PortalServerMessage, type RecordChange } from './events'
import { publishRecordChange } from './publish.server'
import { broadcast, join, leaveAll, tenantRoom } from './rooms.server'
import { shared } from './shared-state.server'

/**
 * The customer's half of the live layer: telling a customer's open portal
 * that their thread with the workshop changed.
 *
 * Nothing new travels. A portal message written, read or deleted is already
 * announced as a change of that customer (prisma-realtime.server.ts), after
 * the transaction commits and to every app instance, on the same bus the
 * staff's screens listen to. This module only listens to that bus for those
 * changes and passes a bare "your thread changed" to the customer's own
 * sockets.
 *
 * What keeps a customer's socket to its own thread:
 *
 * - It stands in exactly two rooms, both named by the server from the
 *   session and never from anything the browser said: its own thread's, and
 *   the one for every customer of its workshop (for the chat being switched
 *   on or off). It cannot ask for a room: the socket's route answers a ping
 *   and nothing else.
 * - Both rooms begin with the workshop (rooms.server.ts), and a staff socket
 *   can never be let into them: `mayJoin` only knows workshop and record
 *   rooms.
 * - On the way out each socket is checked once more against the customer and
 *   workshop the change names, so neither wall has to be perfect.
 * - What is sent has nothing in it. Even delivered to the wrong socket it
 *   would say only "read your own thread again".
 */

export interface PortalSocket {
  readyState: number
  send(data: string): void
  /** Set from the customer's session when the socket is recognised. */
  portalOrganizationId?: string
  portalCustomerId?: string
}

/** A customer's own thread. */
function threadRoom(organizationId: string, customerId: string): string {
  return tenantRoom(organizationId, `portal:${customerId}`)
}

/** Every customer of one workshop. */
function everyoneRoom(organizationId: string): string {
  return tenantRoom(organizationId, 'portal:*')
}

/** A customer may have the portal open in a few tabs and on a phone; not in fifty. */
export const MAX_PORTAL_SOCKETS_PER_CUSTOMER = 12
const counts = shared('portal.counts', () => new Map<string, number>())

/**
 * Puts a recognised customer's socket where its signals arrive. False when
 * this customer already holds as many sockets as one person can use.
 */
export function joinPortalSocket(
  socket: PortalSocket,
  session: { organizationId: string; customerId: string }
): boolean {
  const key = threadRoom(session.organizationId, session.customerId)
  const held = counts.get(key) ?? 0
  if (held >= MAX_PORTAL_SOCKETS_PER_CUSTOMER) return false
  counts.set(key, held + 1)
  socket.portalOrganizationId = session.organizationId
  socket.portalCustomerId = session.customerId
  join(socket, key)
  join(socket, everyoneRoom(session.organizationId))
  return true
}

/** Everything a customer's socket held, on its way out. */
export function leavePortalSocket(socket: PortalSocket): void {
  if (socket.portalOrganizationId && socket.portalCustomerId) {
    const key = threadRoom(socket.portalOrganizationId, socket.portalCustomerId)
    const held = (counts.get(key) ?? 1) - 1
    if (held > 0) counts.set(key, held)
    else counts.delete(key)
    socket.portalOrganizationId = undefined
    socket.portalCustomerId = undefined
  }
  leaveAll(socket)
}

const THREAD_CHANGED = JSON.stringify({ t: 'thread' } satisfies PortalServerMessage)

/** Tells the sockets a change of a customer's portal thread belongs to. */
export function deliverPortalChange(change: RecordChange): number {
  if (change.kind !== 'customer' || change.hint !== PORTAL_THREAD_HINT) return 0
  const { organizationId, id: customerId } = change
  let told = 0
  const tell = (member: object) => {
    const socket = member as PortalSocket
    if (socket.readyState !== 1) return
    if (socket.portalOrganizationId !== organizationId) return
    if (customerId && socket.portalCustomerId !== customerId) return
    socket.send(THREAD_CHANGED)
    told++
  }
  // No customer named: the chat was switched on or off for the workshop.
  broadcast(
    customerId ? threadRoom(organizationId, customerId) : everyoneRoom(organizationId),
    tell
  )
  return told
}

/**
 * Starts passing portal changes from the bus to customers' sockets. Each
 * load of the socket's route takes the previous listener down and puts its
 * own up, as the staff socket's route does, so a hot reload never leaves two.
 */
const wiring = shared('portal.wiring', () => ({ stop: null as (() => void) | null }))
export function startPortalDelivery(): void {
  wiring.stop?.()
  wiring.stop = onBusMessage((message) => {
    if (message.t === 'record') deliverPortalChange(message.change)
  })
}

/**
 * Says that the workshop's portal chat was switched on or off, so every
 * customer with the portal open finds out without reloading. A setting is
 * not a row the write hook follows, so this one is said by hand: call it
 * after the settings are saved. It rides the same record change the
 * messages do, without a customer's id.
 */
export function publishPortalChatSwitched(organizationId: string): void {
  publishRecordChange({
    kind: 'customer',
    id: null,
    organizationId,
    hint: PORTAL_THREAD_HINT,
  })
}

/** What this instance is holding, for the tests. */
export function portalSocketStats(): { customers: number; sockets: number } {
  let sockets = 0
  for (const held of counts.values()) sockets += held
  return { customers: counts.size, sockets }
}

/** Only for tests. */
export function resetPortalSockets(): void {
  counts.clear()
}
