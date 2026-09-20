import type { IncomingMessage } from 'node:http'
import type WebSocket from 'ws'
import { cookies } from 'next/headers'
import { resolveMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'
import { readsNotifications } from '@/lib/notification-roles'
import { onBusMessage, publishToBus } from '@/lib/realtime/bus.server'
import { queueFor } from '@/lib/realtime/protocol.server'
import {
  broadcast,
  leaveAll,
  parseTenantRoom,
  roomsOf,
  tenantRoom,
} from '@/lib/realtime/rooms.server'
import { leaveAllRooms, onPresenceChange, startPresence } from '@/lib/realtime/presence.server'
import { orgRoom, presenceColor, recordRoom, type ServerMessage } from '@/lib/realtime/events'
import { shared } from '@/lib/realtime/shared-state.server'

/**
 * The one socket a browser holds.
 *
 * It carries three things: what changed (by room), who else is on the record
 * (presence), and the older workshop-wide channels that pages have not moved
 * off yet. One connection rather than the five the app used to open, because
 * every one of them was an authentication, a reconnect loop and a place for a
 * bug of its own.
 *
 * Delivery is by room, and a room is only ever joined after the server has
 * checked it belongs to this socket's workshop (authorize.server.ts). A room
 * stops existing the moment its last socket leaves, and every room a socket
 * held is dropped when it closes, so a workshop that opens ten thousand work
 * orders in a month leaves nothing behind.
 */

// Required so Next.js route validator recognizes this as a valid route module
export function GET() {
  return new Response('WebSocket endpoint', { status: 426 })
}

export interface TaggedWebSocket extends WebSocket {
  userId: string
  userName: string
  organizationId: string
  role: string
  isAlive: boolean
}

/** Every authenticated socket on this instance, for the legacy channels. */
const clients = shared('route.clients', () => new Set<TaggedWebSocket>())

/** Development only: the socket's own story, for when a page misbehaves. */
function trace(what: string): void {
  if (process.env.NODE_ENV !== 'production') console.warn(`[realtime] ${what}`)
}

function send(socket: TaggedWebSocket, message: ServerMessage): void {
  if (socket.readyState !== 1) return
  socket.send(JSON.stringify(message))
}

/* ------------------------------------------------------- what changed --- */

/**
 * The listeners that carry events to sockets, registered by whichever copy of
 * this module was loaded last.
 *
 * They used to be registered once and guarded by a flag, which in development
 * meant the first version of this file to load kept handling every event for
 * the life of the process, whatever was edited afterwards: old code reading
 * state that new code had written, failing in ways no restart-free session
 * could explain. Each load now takes the previous listeners down and puts its
 * own up. In production the module loads once and this is the same as before.
 */
const wiring = shared('route.wiring', () => ({ stop: [] as (() => void)[] }))
for (const stop of wiring.stop.splice(0)) stop()

startPresence()

// Record changes, from this instance and from every other one.
wiring.stop.push(
  onBusMessage((message) => {
    if (message.t !== 'record') return
    const { change } = message
    const rooms = change.id
      ? [recordRoom(change.kind, change.id), orgRoom(change.organizationId)]
      : [orgRoom(change.organizationId)]
    const told = new Set<TaggedWebSocket>()
    for (const room of rooms) {
      // Sent to the changed record's own workshop and nowhere else: the room
      // key begins with it, and a socket is checked against it again on the
      // way out, so neither wall has to be perfect for the other to hold.
      broadcast(tenantRoom(change.organizationId, room), (member) => {
        const socket = member as TaggedWebSocket
        if (socket.organizationId !== change.organizationId) return
        if (told.has(socket)) return
        told.add(socket)
        send(socket, { t: 'record', change })
      })
    }
  })
)

// Who is on a record, whenever it changes here or anywhere else.
wiring.stop.push(
  onPresenceChange((key, users) => {
    const tenant = parseTenantRoom(key)
    if (!tenant) return
    broadcast(key, (member) => {
      const socket = member as TaggedWebSocket
      if (socket.organizationId !== tenant.organizationId) return
      // The browser hears the room by the name it asked for.
      send(socket, { t: 'presence', room: tenant.room, users })
    })
  })
)

// The channels that predate rooms. Still workshop-wide, still filtered by
// role for the notification feed, and relayed between instances now so a
// second container does not silently halve who hears them.
for (const channel of ['notification', 'workboard', 'broadcast'] as const) {
  const relay = (data: unknown) => publishToBus({ t: 'legacy', channel, data })
  notificationBus.on(channel, relay)
  wiring.stop.push(() => notificationBus.off(channel, relay))
}
wiring.stop.push(
  onBusMessage((message) => {
    if (message.t !== 'legacy') return
    const { channel, data } = message
    const organizationId = (data as { organizationId?: string })?.organizationId
    for (const socket of clients) {
      if (socket.readyState !== 1) continue
      if (channel !== 'broadcast' && socket.organizationId !== organizationId) continue
      if (channel === 'notification' && !readsNotifications(socket.role)) continue
      send(socket, { t: 'legacy', channel, data })
    }
  })
)

/* -------------------------------------------------------------- session -- */

/**
 * Resolve the session token from the Next.js cookie store.
 * better-auth uses chunked cookies for large tokens (.0, .1, …)
 * and prefixes with __Secure- when useSecureCookies is enabled.
 */
function getSessionToken(cookieStore: Awaited<ReturnType<typeof cookies>>): string | undefined {
  const isSecure = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')
  const prefix = isSecure ? '__Secure-' : ''
  const baseName = `${prefix}better-auth.session_token`

  // Try single cookie first
  let raw = cookieStore.get(baseName)?.value

  // Try chunked cookies (.0, .1, .2, …)
  if (!raw) {
    let chunked = ''
    for (let i = 0; ; i++) {
      const chunk = cookieStore.get(`${baseName}.${i}`)?.value
      if (!chunk) break
      chunked += chunk
    }
    if (chunked) raw = chunked
  }

  if (!raw) return undefined

  // better-auth signs cookies as "token.signature" — strip the signature
  const dotIndex = raw.indexOf('.')
  return dotIndex > 0 ? raw.substring(0, dotIndex) : raw
}

/* ------------------------------------------------------------ the socket -- */

/** Frames a browser may send before it has been recognised; then it is cut. */
const MAX_FRAMES_BEFORE_AUTH = 32
/** A socket that has not been recognised by now never will be. */
const AUTH_TIMEOUT_MS = 15_000
/** The server's own ping, which is what finds a link that died silently. */
const PING_EVERY_MS = 30_000
/** Every tenth ping, ask whether this session and this membership still exist. */
const RECHECK_EVERY_PINGS = 10

export function UPGRADE(ws: WebSocket, _server: unknown, _request: IncomingMessage) {
  const client = ws as TaggedWebSocket
  client.isAlive = true

  /**
   * Both listeners go on before anything is awaited.
   *
   * Recognising the session takes two database reads, and a browser does not
   * wait for them: what it sends in that window arrives at a socket nobody is
   * listening to yet, and `ws` drops a frame with no listener. So frames are
   * kept until the socket is known and then handled in order. The same goes
   * for a close during those reads: heard late, it would leave the socket in
   * `clients` with a timer running for the life of the process.
   */
  let closed = false
  let handle: ((raw: unknown) => void) | null = null
  let early: unknown[] | null = []
  let pingInterval: ReturnType<typeof setInterval> | undefined

  const authTimeout = setTimeout(() => {
    if (!handle) ws.close(4001, 'Not recognised in time')
  }, AUTH_TIMEOUT_MS)
  authTimeout.unref?.()

  ws.on('message', (raw: unknown) => {
    if (handle) return handle(raw)
    if (!early) return
    if (early.length >= MAX_FRAMES_BEFORE_AUTH) {
      early = null
      ws.close(1008, 'Too much, too early')
      return
    }
    early.push(raw)
  })

  // Everything this socket held, in one place, on every way out. A socket
  // that dies without a close event is terminated by the ping below, which
  // fires 'close' in its turn.
  ws.on('close', (code: number, reason: unknown) => {
    closed = true
    early = null
    handle = null
    clearTimeout(authTimeout)
    if (pingInterval) clearInterval(pingInterval)
    clients.delete(client)
    leaveAllRooms(client)
    leaveAll(client)
    if (client.userName) {
      trace(`socket closed for ${client.userName} (${code}${reason ? ` ${reason}` : ''})`)
    }
  })

  ws.on('error', () => ws.terminate())

  ws.on('pong', () => {
    client.isAlive = true
  })

  ;(async () => {
    try {
      // next-ws patches cookies() to resolve WebSocket request cookies
      const cookieStore = await cookies()

      const sessionToken = getSessionToken(cookieStore)
      if (!sessionToken) {
        // Names only, never values: enough to see a cookie that is called
        // something this did not expect.
        const names = cookieStore.getAll().map((cookie) => cookie.name)
        trace(`socket refused: no session cookie among [${names.join(', ')}]`)
        ws.close(4001, 'No session token')
        return
      }

      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { userId: true, expiresAt: true, user: { select: { name: true, email: true } } },
      })

      if (!session || session.expiresAt < new Date()) {
        trace(
          `socket refused: ${session ? 'the session has expired' : 'no session has that token'}`
        )
        ws.close(4001, 'Invalid or expired session')
        return
      }

      const activeOrgId = cookieStore.get('active-org-id')?.value

      // Decided where the rest of the app decides it, so the socket and the
      // pages can never disagree about which workshop this person is in.
      const membership = await resolveMembership(session.userId, activeOrgId)

      if (!membership) {
        trace(`socket refused: ${session.user?.name ?? session.userId} is in no workshop`)
        ws.close(4001, 'No organization')
        return
      }

      // It went away while it was being looked up: nothing to register.
      if (closed || ws.readyState !== 1) return

      // Every member of the workshop may listen. What they are told is decided
      // per room and per channel: a record's room is checked against this
      // workshop before it is joined, and the notification feed stays with the
      // roles that can already read it.
      client.userId = session.userId
      client.userName = session.user?.name || session.user?.email || 'Someone'
      client.organizationId = membership.organizationId
      client.role = membership.role

      clients.add(client)
      clearTimeout(authTimeout)

      let pings = 0
      pingInterval = setInterval(() => {
        if (!client.isAlive) {
          ws.terminate()
          return
        }
        client.isAlive = false
        ws.ping()

        // A session ended from the devices list, or somebody taken out of the
        // workshop, must stop hearing it. The socket was recognised once, so
        // it is asked again now and then rather than trusted for ever.
        if (++pings % RECHECK_EVERY_PINGS !== 0) return
        Promise.all([
          db.session.findUnique({ where: { token: sessionToken }, select: { expiresAt: true } }),
          db.organizationMember.findFirst({
            where: { userId: client.userId, organizationId: client.organizationId },
            select: { id: true },
          }),
        ])
          .then(([current, stillMember]) => {
            if (!current || current.expiresAt < new Date()) ws.close(4001, 'Session ended')
            else if (!stillMember) ws.close(4001, 'No longer in this workshop')
          })
          .catch(() => undefined)
      }, PING_EVERY_MS)
      pingInterval.unref?.()

      // One at a time, in the order they were sent (see protocol.server.ts).
      const queue = queueFor(
        {
          userId: client.userId,
          userName: client.userName,
          organizationId: client.organizationId,
          send: (message) => send(client, message),
        },
        client,
        trace
      )

      trace(`socket open for ${client.userName} in ${client.organizationId}`)
      send(client, {
        t: 'ready',
        you: {
          userId: client.userId,
          name: client.userName,
          color: presenceColor(client.userId),
        },
      })

      // Whatever arrived while the session was being read, then everything after.
      const waiting = early ?? []
      early = null
      handle = queue
      for (const raw of waiting) queue(raw)
    } catch (err) {
      console.error('[WS] Auth error:', err)
      ws.close(4500, 'Auth error')
    }
  })()
}

/** What this instance is holding, for a health readout and for the tests. */
export function socketStats(): { sockets: number; rooms: number } {
  let rooms = 0
  for (const socket of clients) rooms += roomsOf(socket).size
  return { sockets: clients.size, rooms }
}
