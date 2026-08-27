import type { IncomingMessage } from 'node:http'
import type WebSocket from 'ws'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationBus } from '@/lib/notification-bus'

/**
 * Live updates for the technician app.
 *
 * Deliberately separate from the work board's socket, which closes any
 * connection that is not owner or admin. A technician is neither, and loosening
 * that check would put every workshop-wide board event on their phone.
 *
 * This socket is a doorbell, not a data channel. It carries no job details at
 * all: it says "something you can see has changed" and the app re-reads through
 * the ordinary authenticated endpoint, which already filters to that
 * technician's own work. Pushing the payload down the socket would mean
 * reimplementing that filtering here, in a second place, where getting it wrong
 * shows one technician another's jobs.
 */

// Required so the Next route validator recognises this as a route module.
export function GET() {
  return new Response('WebSocket endpoint', { status: 426 })
}

interface TechSocket extends WebSocket {
  userId: string
  organizationId: string
  isAlive: boolean
}

const clients = new Set<TechSocket>()

/** One event name for every change. See the doorbell note above. */
function ring(organizationId: string, reason: string) {
  const payload = JSON.stringify({ type: 'changed', reason })
  for (const client of clients) {
    if (client.organizationId === organizationId && client.readyState === 1) {
      client.send(payload)
    }
  }
}

notificationBus.on('workboard', (event: { organizationId: string; type?: string }) => {
  ring(event.organizationId, event.type ?? 'workboard')
})

notificationBus.on('notification', (event: { organizationId: string }) => {
  ring(event.organizationId, 'notification')
})

export function UPGRADE(ws: WebSocket, _server: unknown, request: IncomingMessage) {
  const client = ws as TechSocket
  client.isAlive = true
  ;(async () => {
    try {
      // The token rides in the WebSocket subprotocol rather than the query
      // string. A URL is written to proxy and server logs in full, so a token
      // there ends up on disk in half a dozen places nobody is guarding.
      const offered = request.headers['sec-websocket-protocol']
      const encoded = (Array.isArray(offered) ? offered.join(',') : (offered ?? ''))
        .split(',')
        .map((p) => p.trim())
        .find((p) => p.startsWith('bearer.'))
        ?.slice('bearer.'.length)

      // Hex, because a subprotocol name may only use RFC 7230 token
      // characters and a session token is base64: its '=' padding and any '/'
      // are illegal there, and a browser refuses the connection outright
      // rather than complaining about one character.
      const token =
        encoded && /^[0-9a-f]+$/i.test(encoded) && encoded.length % 2 === 0
          ? Buffer.from(encoded, 'hex').toString('utf8')
          : undefined

      if (!token) {
        ws.close(4001, 'No token')
        return
      }

      // Resolved through Better Auth, exactly as the HTTP API does, so a
      // revoked session cannot keep a socket alive that a request could not
      // open. Looking the token up in the session table directly would miss
      // that and quietly keep working.
      const session = await auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${token}` }),
      })
      if (!session?.user?.id) {
        ws.close(4001, 'Invalid or expired session')
        return
      }

      // Which workshop this socket is for.
      //
      // Offered as a second subprotocol by the app, because a WebSocket
      // handshake carries no headers we control. It only selects: the
      // membership lookup is what decides, and an id the user is not a member
      // of falls through to their default rather than granting anything.
      //
      // Without this a technician who works for two workshops subscribed to
      // whichever membership came back first, so they were told about changes
      // in one shop while using the app against the other.
      const wantedOrg = (Array.isArray(offered) ? offered.join(',') : (offered ?? ''))
        .split(',')
        .map((p) => p.trim())
        .find((p) => p.startsWith('org.'))
        ?.slice('org.'.length)

      const membership =
        (wantedOrg
          ? await db.organizationMember.findFirst({
              where: { userId: session.user.id, organizationId: wantedOrg },
              select: { organizationId: true },
            })
          : null) ??
        (await db.organizationMember.findFirst({
          where: { userId: session.user.id },
          select: { organizationId: true },
        }))
      if (!membership) {
        ws.close(4001, 'No organization')
        return
      }

      // Only actual technicians. Everyone else has nothing on this socket.
      const isTechnician = await db.technician.findFirst({
        where: {
          organizationId: membership.organizationId,
          userId: session.user.id,
          isActive: true,
        },
        select: { id: true },
      })
      if (!isTechnician) {
        ws.close(4003, 'Not a technician')
        return
      }

      client.userId = session.user.id
      client.organizationId = membership.organizationId
      clients.add(client)

      // A phone moves between wifi and mobile data, and a socket dropped in
      // that handover otherwise looks alive from this end forever.
      const ping = setInterval(() => {
        if (!client.isAlive) {
          clearInterval(ping)
          ws.terminate()
          return
        }
        client.isAlive = false
        ws.ping()
      }, 30_000)

      ws.on('pong', () => {
        client.isAlive = true
      })

      ws.on('close', () => {
        clearInterval(ping)
        clients.delete(client)
      })

      ws.on('error', () => {
        clearInterval(ping)
        clients.delete(client)
      })

      // Tells the app it is live, so it can stop its fallback polling.
      ws.send(JSON.stringify({ type: 'ready' }))
    } catch {
      ws.close(4000, 'Could not open')
    }
  })()
}
