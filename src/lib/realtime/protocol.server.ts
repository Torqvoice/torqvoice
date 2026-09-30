import 'server-only'

import { mayJoin } from './authorize.server'
import { enterRoom, leaveRoom } from './presence.server'
import { isInRoom, join, leave, MAX_ROOMS_PER_SOCKET, tenantRoom } from './rooms.server'
import type { ClientMessage, ServerMessage } from './events'

/**
 * What a browser asks for, and what it is given.
 *
 * Kept out of the route so it can be driven directly by a test. The ordering
 * rule below is the reason: it is not visible in the shape of the code, only
 * in what happens when two messages arrive together, and that is exactly the
 * kind of fault that reaches production looking like "presence does not
 * work sometimes".
 *
 * **One message at a time, in the order they were sent.** A browser
 * subscribes to a room and then stands in it. The subscribe is checked
 * against the database, so if the two were handled concurrently the "enter"
 * would arrive while the socket was not yet in the room, be refused, and
 * nobody's chip would appear. `queueFor` is what the route wraps a socket in.
 */

export interface Client {
  userId: string
  userName: string
  organizationId: string
  send(message: ServerMessage): void
}

/**
 * The most one frame may weigh. The largest honest one is a reconnecting tab
 * naming fifty rooms, which is a couple of kilobytes.
 */
export const MAX_FRAME_BYTES = 8 * 1024

/**
 * How many frames may wait behind the one being handled. A page sends a
 * handful when it opens; a socket with hundreds queued is not a page, and its
 * frames are dropped rather than kept in memory for it.
 */
export const MAX_QUEUED_FRAMES = 128

function sizeOf(raw: unknown): number {
  if (typeof raw === 'string') return raw.length
  if (raw instanceof ArrayBuffer) return raw.byteLength
  if (ArrayBuffer.isView(raw)) return raw.byteLength
  if (Array.isArray(raw)) return raw.reduce((sum: number, part) => sum + sizeOf(part), 0)
  return 0
}

/** Anything unknown is ignored rather than answered. */
export async function handleClientMessage(
  client: Client,
  socket: object,
  raw: unknown,
  trace: (what: string) => void = () => undefined
): Promise<void> {
  if (sizeOf(raw) > MAX_FRAME_BYTES) return
  let message: ClientMessage
  try {
    message = JSON.parse(String(raw)) as ClientMessage
  } catch {
    return
  }
  if (!message || typeof message.t !== 'string') return

  // Every room this socket touches is its own workshop's (rooms.server.ts).
  // The browser's name for a room is only ever used to answer the browser.
  const mine = (room: string) => tenantRoom(client.organizationId, room)

  switch (message.t) {
    case 'ping':
      client.send({ t: 'pong' })
      return

    case 'sub': {
      if (!Array.isArray(message.rooms)) return
      const joined: string[] = []
      for (const room of message.rooms.slice(0, MAX_ROOMS_PER_SOCKET)) {
        if (typeof room !== 'string') continue
        if (isInRoom(socket, mine(room))) {
          joined.push(room)
          continue
        }
        // The room name came from the browser, so it is a request, never a
        // fact: the server decides whether it belongs to this workshop.
        if (!(await mayJoin(room, client.organizationId))) continue
        if (!join(socket, mine(room))) continue
        joined.push(room)
      }
      trace(
        `${client.userName} subscribed to ${joined.join(', ') || 'nothing'} ` +
          `(asked for ${message.rooms.join(', ')})`
      )
      client.send({ t: 'subscribed', rooms: joined })
      return
    }

    case 'unsub': {
      if (!Array.isArray(message.rooms)) return
      for (const room of message.rooms) {
        if (typeof room !== 'string') continue
        leaveRoom(mine(room), socket)
        leave(socket, mine(room))
      }
      return
    }

    case 'enter': {
      // Presence follows a subscription, so the check on the way in is the
      // only gate needed here.
      if (typeof message.room !== 'string') return
      if (!isInRoom(socket, mine(message.room))) {
        trace(`${client.userName} tried to enter ${message.room} without holding it`)
        return
      }
      trace(`${client.userName} entered ${message.room}`)
      // The room is told, the newcomer included, a tick later (presence
      // gathers its announcements): one frame, and one place that sends it.
      enterRoom(mine(message.room), socket, { userId: client.userId, name: client.userName })
      return
    }

    case 'leave': {
      if (typeof message.room !== 'string') return
      leaveRoom(mine(message.room), socket)
      return
    }
  }
}

/**
 * A socket's messages, handled one after another.
 *
 * Returns the function the route hands every incoming frame to. Errors are
 * logged and swallowed, so one bad frame cannot stop the ones behind it.
 */
export function queueFor(
  client: Client,
  socket: object,
  trace?: (what: string) => void
): (raw: unknown) => void {
  let queue: Promise<void> = Promise.resolve()
  let waiting = 0
  return (raw: unknown) => {
    if (waiting >= MAX_QUEUED_FRAMES) return
    waiting++
    queue = queue
      .then(() => handleClientMessage(client, socket, raw, trace))
      .catch((error) => {
        console.error('[realtime] a message could not be handled:', error)
      })
      .finally(() => {
        waiting--
      })
  }
}
