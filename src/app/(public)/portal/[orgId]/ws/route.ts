import type { IncomingMessage } from 'node:http'
import type WebSocket from 'ws'
import { isPortalLive } from '@/features/portal/Lib/portalLive'
import { getCustomerSession } from '@/lib/customer-session'
import { db } from '@/lib/db'
import type { PortalServerMessage } from '@/lib/realtime/events'
import {
  type PortalSocket,
  joinPortalSocket,
  leavePortalSocket,
  startPortalDelivery,
} from '@/lib/realtime/portal.server'

/**
 * The socket a signed-in customer's portal holds, so a message from the
 * workshop is on screen the moment it is sent and not at the next poll.
 *
 * Under /portal and not /api: the customer's session cookie is scoped to the
 * path "/portal", so a browser only sends it here.
 *
 * It is receive-only, and it is not the staff's socket in any part:
 *
 * - It is recognised by the customer's session and bound to that customer
 *   and that workshop, both read on the server.
 * - It joins nothing by request. The server places it in its own thread's
 *   room (lib/realtime/portal.server.ts); a "sub" for a staff room is a
 *   frame like any other and is ignored.
 * - All it is ever sent is "ready", "thread" (read your thread again) and
 *   "pong". All it may send is a ping. A socket that sends much else, or
 *   anything large, is closed.
 */

// Required so Next.js route validator recognizes this as a valid route module
export function GET() {
  return new Response('WebSocket endpoint', { status: 426 })
}

startPortalDelivery()

/** The server's own ping, which is what finds a link that died silently. */
const PING_EVERY_MS = 30_000
/** Every tenth ping, ask whether this session still exists. */
const RECHECK_EVERY_PINGS = 10
/** A socket that has not been recognised by now never will be. */
const AUTH_TIMEOUT_MS = 15_000
/** A ping is seven bytes. Nothing a portal sends is larger. */
const MAX_FRAME_BYTES = 64
/** A browser pings every half minute; this is a script. */
const MAX_FRAMES_PER_MINUTE = 30

const frameSize = (raw: unknown): number =>
  typeof raw === 'string'
    ? raw.length
    : Array.isArray(raw)
      ? raw.reduce((sum, part) => sum + (part as Buffer).length, 0)
      : ((raw as { byteLength?: number; length?: number })?.byteLength ??
        (raw as { length?: number })?.length ??
        0)

/** The slug or id in the address: /portal/<org>/ws. */
function orgParamOf(request: IncomingMessage): string | null {
  // next-ws hands over the address as a path on some versions and as a whole
  // URL on others; read the path from either.
  let path: string
  try {
    path = new URL(request.url ?? '', 'http://portal.invalid').pathname
  } catch {
    return null
  }
  const match = /^\/portal\/([^/]+)\/ws\/?$/.exec(path)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

export function UPGRADE(ws: WebSocket, _server: unknown, request: IncomingMessage) {
  const socket = ws as WebSocket & PortalSocket
  let alive = true
  let closed = false
  let recognised = false
  let pingInterval: ReturnType<typeof setInterval> | undefined
  let frames = 0
  let windowStart = Date.now()

  const say = (message: PortalServerMessage) => {
    if (ws.readyState === 1) ws.send(JSON.stringify(message))
  }

  const authTimeout = setTimeout(() => {
    if (!recognised) ws.close(4001, 'Not recognised in time')
  }, AUTH_TIMEOUT_MS)
  authTimeout.unref?.()

  // Listeners first, before anything is awaited: a close during the session
  // read must still be heard, or the socket would be joined after it left.
  ws.on('message', (raw: unknown) => {
    const now = Date.now()
    if (now - windowStart > 60_000) {
      windowStart = now
      frames = 0
    }
    if (++frames > MAX_FRAMES_PER_MINUTE || frameSize(raw) > MAX_FRAME_BYTES) {
      ws.close(1008, 'This socket only listens')
      return
    }
    if (!recognised) return
    let type: unknown
    try {
      type = (JSON.parse(String(raw)) as { t?: unknown })?.t
    } catch {
      return
    }
    // The one thing a portal may say. Everything else, a "sub" for a staff
    // room included, is not answered and changes nothing.
    if (type === 'ping') say({ t: 'pong' })
  })

  ws.on('close', () => {
    closed = true
    clearTimeout(authTimeout)
    if (pingInterval) clearInterval(pingInterval)
    leavePortalSocket(socket)
  })
  ws.on('error', () => ws.terminate())
  ws.on('pong', () => {
    alive = true
  })

  ;(async () => {
    try {
      const orgParam = orgParamOf(request)
      // next-ws patches cookies() to resolve the upgrade request's cookies.
      const session = await getCustomerSession()
      if (!orgParam || !session) {
        ws.close(4001, 'Not signed in')
        return
      }

      // The address must be the session's own workshop, by slug or by id,
      // and its portal must still answer.
      const org = await db.organization.findFirst({
        where: { id: session.organizationId, OR: [{ portalSlug: orgParam }, { id: orgParam }] },
        select: { id: true },
      })
      if (!org || !(await isPortalLive(org.id))) {
        ws.close(4001, 'Not signed in here')
        return
      }

      // It went away while it was being looked up: nothing to register.
      if (closed || ws.readyState !== 1) return

      if (!joinPortalSocket(socket, session)) {
        ws.close(1013, 'Too many open pages')
        return
      }
      recognised = true
      clearTimeout(authTimeout)

      let pings = 0
      pingInterval = setInterval(() => {
        if (!alive) {
          ws.terminate()
          return
        }
        alive = false
        ws.ping()
        // Signed out elsewhere, or the session ran out: stop listening.
        if (++pings % RECHECK_EVERY_PINGS !== 0) return
        db.customerSession
          .findFirst({
            where: {
              customerId: session.customerId,
              organizationId: session.organizationId,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          })
          .then((current) => {
            if (!current) ws.close(4001, 'Session ended')
          })
          .catch(() => undefined)
      }, PING_EVERY_MS)
      pingInterval.unref?.()

      say({ t: 'ready' })
    } catch (error) {
      console.error('[portal ws] could not recognise a socket:', error)
      ws.close(4500, 'Auth error')
    }
  })()
}
