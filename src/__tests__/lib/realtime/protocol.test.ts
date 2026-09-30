/**
 * @vitest-environment node
 *
 * What a browser asks the socket for.
 *
 * The test that matters here is the boring-looking one about order. A page
 * subscribes to a room and then stands in it, and the subscribe is checked
 * against the database while the "enter" is already on its way. Handled
 * concurrently, the enter arrives before the room has been joined, is
 * refused, and nobody's chip ever appears: two people on one work order, and
 * neither sees the other, with nothing in any log to say why.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mayJoin = vi.hoisted(() => vi.fn(async (_room: string, _organizationId: string) => true))
vi.mock('@/lib/realtime/authorize.server', () => ({ mayJoin }))

import {
  handleClientMessage,
  MAX_FRAME_BYTES,
  MAX_QUEUED_FRAMES,
  queueFor,
  type Client,
} from '@/lib/realtime/protocol.server'
import {
  flushPresence,
  onPresenceChange,
  presenceOf,
  resetPresence,
} from '@/lib/realtime/presence.server'
import { broadcast, isInRoom, resetRooms, stats } from '@/lib/realtime/rooms.server'
import type { ServerMessage } from '@/lib/realtime/events'

const ROOM = 'rec:serviceRecord:job-1'
/** The same room as the server keeps it: under the desk's own workshop. */
const KEPT = 'org-1|rec:serviceRecord:job-1'

function desk(): { client: Client; socket: object; sent: ServerMessage[] } {
  const sent: ServerMessage[] = []
  return {
    client: {
      userId: 'u-1',
      userName: 'Christian',
      organizationId: 'org-1',
      send: (message) => sent.push(message),
    },
    socket: { name: 'desk' },
    sent,
  }
}

const say = (client: Client, socket: object, message: unknown) =>
  handleClientMessage(client, socket, JSON.stringify(message))

/** Lets a queued chain run to the end. */
async function settle() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  mayJoin.mockReset().mockResolvedValue(true)
})

afterEach(() => {
  resetRooms()
  resetPresence()
})

describe('subscribing', () => {
  it('joins a room the workshop owns, and says which', async () => {
    const { client, socket, sent } = desk()

    await say(client, socket, { t: 'sub', rooms: [ROOM] })

    expect(isInRoom(socket, KEPT)).toBe(true)
    expect(sent).toEqual([{ t: 'subscribed', rooms: [ROOM] }])
  })

  it('refuses a room from another workshop, silently', async () => {
    mayJoin.mockResolvedValue(false)
    const { client, socket, sent } = desk()

    await say(client, socket, { t: 'sub', rooms: ['rec:serviceRecord:someone-elses'] })

    expect(stats().rooms).toBe(0)
    // Named as not joined rather than refused: a socket learns nothing about
    // whether that record exists.
    expect(sent).toEqual([{ t: 'subscribed', rooms: [] }])
  })

  it('leaves on unsub, taking the room with it', async () => {
    const { client, socket } = desk()
    await say(client, socket, { t: 'sub', rooms: [ROOM] })
    await say(client, socket, { t: 'enter', room: ROOM })

    await say(client, socket, { t: 'unsub', rooms: [ROOM] })

    expect(stats()).toEqual({ rooms: 0, members: 0, subscriptions: 0 })
    expect(presenceOf(KEPT)).toEqual([])
  })
})

describe('presence', () => {
  it('stands in a room it holds, and the room is told', async () => {
    const { client, socket } = desk()
    const told: string[][] = []
    const stop = onPresenceChange((_room, users) => told.push(users.map((user) => user.name)))
    await say(client, socket, { t: 'sub', rooms: [ROOM] })

    await say(client, socket, { t: 'enter', room: ROOM })
    flushPresence()
    stop()

    // The newcomer hears it the way everybody else does, through the room
    // (the route sends a presence change to every socket in it): one frame,
    // from one place.
    expect(presenceOf(KEPT).map((user) => user.name)).toEqual(['Christian'])
    expect(told).toEqual([['Christian']])
  })

  it('cannot stand in a room it does not hold', async () => {
    const { client, socket } = desk()

    await say(client, socket, { t: 'enter', room: ROOM })

    expect(presenceOf(KEPT)).toEqual([])
  })
})

describe('two messages sent together', () => {
  it('handles them in order, so "enter" is not refused while "sub" is still checking', async () => {
    // The real shape of it: the subscribe waits on the database.
    let allow: (value: boolean) => void = () => undefined
    mayJoin.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          allow = resolve
        })
    )
    const { client, socket, sent } = desk()
    const queue = queueFor(client, socket)

    queue(JSON.stringify({ t: 'sub', rooms: [ROOM] }))
    queue(JSON.stringify({ t: 'enter', room: ROOM }))
    await settle()

    // The check is still out, so neither message has finished: this is the
    // window in which the enter used to be refused.
    expect(isInRoom(socket, KEPT)).toBe(false)
    expect(presenceOf(KEPT)).toEqual([])

    allow(true)
    await settle()

    expect(isInRoom(socket, KEPT)).toBe(true)
    expect(presenceOf(KEPT).map((user) => user.name)).toEqual(['Christian'])
    expect(sent).toContainEqual({ t: 'subscribed', rooms: [ROOM] })
  })

  it('keeps going after one of them fails', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mayJoin.mockRejectedValueOnce(new Error('database gone')).mockResolvedValue(true)
    const { client, socket, sent } = desk()
    const queue = queueFor(client, socket)

    queue(JSON.stringify({ t: 'sub', rooms: [ROOM] }))
    queue(JSON.stringify({ t: 'ping' }))
    await settle()

    expect(errors).toHaveBeenCalled()
    expect(sent).toContainEqual({ t: 'pong' })
  })
})

describe('a socket that is not a page', () => {
  it('ignores a frame far larger than any page sends', async () => {
    const { client, socket, sent } = desk()
    const rooms = Array.from({ length: 2_000 }, (_, i) => `rec:serviceRecord:job-${i}`)

    await say(client, socket, { t: 'sub', rooms })

    expect(JSON.stringify({ t: 'sub', rooms }).length).toBeGreaterThan(MAX_FRAME_BYTES)
    expect(sent).toEqual([])
    expect(stats().rooms).toBe(0)
  })

  it('stops queueing behind a check that never returns', async () => {
    mayJoin.mockImplementation(() => new Promise<boolean>(() => undefined))
    const { client, socket, sent } = desk()
    const queue = queueFor(client, socket)

    queue(JSON.stringify({ t: 'sub', rooms: [ROOM] }))
    for (let i = 0; i < MAX_QUEUED_FRAMES * 3; i++) queue(JSON.stringify({ t: 'ping' }))
    await settle()

    // Nothing behind the stuck one has run, and nothing beyond the limit was
    // kept to run later: memory held for this socket is bounded.
    expect(sent).toEqual([])
  })
})

describe('anything else', () => {
  it('is ignored rather than answered', async () => {
    const { client, socket, sent } = desk()

    await handleClientMessage(client, socket, 'not json')
    await say(client, socket, { t: 'nonsense' })
    await say(client, socket, { t: 'sub', rooms: 'not an array' })

    expect(sent).toEqual([])
    expect(stats().rooms).toBe(0)
  })
})

describe('two workshops', () => {
  const other = (): { client: Client; socket: object; sent: ServerMessage[] } => {
    const sent: ServerMessage[] = []
    return {
      client: {
        userId: 'u-9',
        userName: 'Stranger',
        organizationId: 'org-2',
        send: (message) => sent.push(message),
      },
      socket: { name: 'another workshop' },
      sent,
    }
  }

  it('never share a room, even if the check that should refuse one says yes', async () => {
    // The worst case on purpose: the ownership check is broken and lets a
    // stranger "join" another workshop's work order by name.
    mayJoin.mockResolvedValue(true)
    const ours = desk()
    const theirs = other()
    await say(ours.client, ours.socket, { t: 'sub', rooms: [ROOM] })
    await say(ours.client, ours.socket, { t: 'enter', room: ROOM })
    await say(theirs.client, theirs.socket, { t: 'sub', rooms: [ROOM] })
    await say(theirs.client, theirs.socket, { t: 'enter', room: ROOM })

    // A change to our job goes to our workshop's room: the stranger is not in it.
    const told: object[] = []
    broadcast('org-1|rec:serviceRecord:job-1', (member) => told.push(member))
    expect(told).toEqual([ours.socket])

    // And neither sees the other standing there.
    expect(presenceOf('org-1|rec:serviceRecord:job-1').map((u) => u.name)).toEqual(['Christian'])
    expect(presenceOf('org-2|rec:serviceRecord:job-1').map((u) => u.name)).toEqual(['Stranger'])
  })

  it('cannot reach another workshop by writing its id into the room name', async () => {
    mayJoin.mockImplementation(async (room: string) => !room.includes('org-1'))
    const theirs = other()

    await say(theirs.client, theirs.socket, {
      t: 'sub',
      rooms: ['org:org-1', 'org-1|rec:serviceRecord:job-1', ROOM],
    })

    // Whatever was granted is kept under the stranger's own workshop.
    const told: object[] = []
    broadcast('org-1|rec:serviceRecord:job-1', (member) => told.push(member))
    broadcast('org-1|org:org-1', (member) => told.push(member))
    expect(told).toEqual([])
    expect(isInRoom(theirs.socket, 'org-2|rec:serviceRecord:job-1')).toBe(true)
  })
})
