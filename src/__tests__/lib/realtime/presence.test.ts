/**
 * @vitest-environment node
 *
 * Who is on a record, across however many app instances are running.
 *
 * Presence is the one piece of this that is not derived from the database:
 * it lives in memory while sockets do. That buys two obligations, and both
 * are tested here. It must not leak, because a room is per record and a
 * workshop opens thousands; and it must forget an instance that dies without
 * saying goodbye, or a crashed container would leave people standing in a
 * room forever, visible to everybody, contactable by nobody.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const published: unknown[] = []
vi.mock('@/lib/realtime/bus.server', () => ({
  INSTANCE_ID: 'this-instance',
  publishToBus: (message: unknown) => published.push(message),
  onBusMessage: () => () => undefined,
}))

import {
  acceptRemotePresence,
  enterRoom,
  flushPresence,
  leaveAllRooms,
  leaveRoom,
  onPresenceChange,
  presenceOf,
  presenceStats,
  resetPresence,
  sweep,
} from '@/lib/realtime/presence.server'
import { presenceColor } from '@/lib/realtime/events'

const ROOM = 'rec:serviceRecord:job-1'
const socket = (name: string) => ({ name })
const CHRISTIAN = { userId: 'u-1', name: 'Christian' }
const MARCO = { userId: 'u-2', name: 'Marco' }
const NOTHING_HELD = { localRooms: 0, remoteRooms: 0, sockets: 0, indexedSockets: 0, waiting: 0 }

beforeEach(() => {
  published.length = 0
})
afterEach(() => resetPresence())

describe('being in a room', () => {
  it('shows the people in it, with a colour each and their own', () => {
    enterRoom(ROOM, socket('a'), CHRISTIAN)
    enterRoom(ROOM, socket('b'), MARCO)

    expect(presenceOf(ROOM)).toEqual([
      { userId: 'u-1', name: 'Christian', color: presenceColor('u-1'), devices: 1 },
      { userId: 'u-2', name: 'Marco', color: presenceColor('u-2'), devices: 1 },
    ])
  })

  it('counts one person on a laptop and a phone as one person', () => {
    enterRoom(ROOM, socket('laptop'), CHRISTIAN)
    enterRoom(ROOM, socket('phone'), CHRISTIAN)

    const [christian, ...rest] = presenceOf(ROOM)
    expect(rest).toEqual([])
    expect(christian.devices).toBe(2)
  })

  it('tells the room whenever it changes', () => {
    const seen: { room: string; names: string[] }[] = []
    const stop = onPresenceChange((room, users) =>
      seen.push({ room, names: users.map((u) => u.name) })
    )

    const desk = socket('desk')
    enterRoom(ROOM, desk, CHRISTIAN)
    flushPresence()
    enterRoom(ROOM, socket('bay'), MARCO)
    flushPresence()
    leaveRoom(ROOM, desk)
    flushPresence()
    stop()

    expect(seen.map((s) => s.names)).toEqual([['Christian'], ['Christian', 'Marco'], ['Marco']])
  })

  it('says it once when several people arrive together', () => {
    // A shift change is three people opening the same job in the same
    // second: one frame to the room, carrying who is there now, not three.
    const seen: string[][] = []
    const stop = onPresenceChange((_room, users) => seen.push(users.map((u) => u.name)))

    enterRoom(ROOM, socket('desk'), CHRISTIAN)
    enterRoom(ROOM, socket('bay'), MARCO)
    flushPresence()
    stop()

    expect(seen).toEqual([['Christian', 'Marco']])
    expect(published).toHaveLength(1)
  })

  it('sends by itself a moment later, without being asked', () => {
    vi.useFakeTimers()
    try {
      const seen: string[] = []
      const stop = onPresenceChange((room) => seen.push(room))
      enterRoom(ROOM, socket('desk'), CHRISTIAN)
      expect(seen).toEqual([])
      vi.advanceTimersByTime(30)
      expect(seen).toEqual([ROOM])
      expect(presenceStats().waiting).toBe(0)
      stop()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('leaving nothing behind', () => {
  it('forgets a room when its last person goes', () => {
    const a = socket('a')
    const b = socket('b')
    enterRoom(ROOM, a, CHRISTIAN)
    enterRoom(ROOM, b, MARCO)

    leaveRoom(ROOM, a)
    expect(presenceStats().localRooms).toBe(1)

    leaveRoom(ROOM, b)
    flushPresence()
    expect(presenceStats()).toEqual(NOTHING_HELD)
  })

  it('drops every room a closing socket stood in', () => {
    const laptop = socket('laptop')
    for (const id of ['1', '2', '3']) enterRoom(`rec:serviceRecord:${id}`, laptop, CHRISTIAN)
    expect(presenceStats().localRooms).toBe(3)

    leaveAllRooms(laptop)

    flushPresence()
    expect(presenceStats()).toEqual(NOTHING_HELD)
  })

  it('holds nothing after a thousand records are opened and closed', () => {
    const laptop = socket('laptop')
    for (let i = 0; i < 1_000; i++) {
      const room = `rec:serviceRecord:${i}`
      enterRoom(room, laptop, CHRISTIAN)
      leaveRoom(room, laptop)
    }
    flushPresence()
    expect(presenceStats()).toEqual(NOTHING_HELD)
  })
})

describe('the other instances', () => {
  it('announces the people on this instance, and only those', () => {
    enterRoom(ROOM, socket('a'), CHRISTIAN)
    flushPresence()

    expect(published).toEqual([
      {
        t: 'presence',
        room: ROOM,
        instanceId: 'this-instance',
        users: [{ userId: 'u-1', name: 'Christian', color: presenceColor('u-1'), devices: 1 }],
        ttlMs: expect.any(Number),
      },
    ])
  })

  it('says a room is empty, so the others drop it too', () => {
    const a = socket('a')
    enterRoom(ROOM, a, CHRISTIAN)
    flushPresence()
    published.length = 0

    leaveRoom(ROOM, a)
    flushPresence()

    expect(published).toEqual([
      {
        t: 'presence',
        room: ROOM,
        instanceId: 'this-instance',
        users: [],
        ttlMs: expect.any(Number),
      },
    ])
  })

  it('renews a lease without telling the room, when an instance repeats itself', () => {
    // Every instance repeats what it holds twice a minute. Telling the room
    // each time would be a frame to every viewer, for ever, about nothing.
    const away = [{ userId: 'u-9', name: 'Away', color: '#000', devices: 1 }]
    const seen: string[] = []
    const stop = onPresenceChange((room) => seen.push(room))

    acceptRemotePresence(ROOM, away, 55_000, 'other-instance')
    acceptRemotePresence(ROOM, [{ ...away[0] }], 55_000, 'other-instance')
    acceptRemotePresence(ROOM, [{ ...away[0] }], 55_000, 'other-instance')
    stop()

    expect(seen).toEqual([ROOM])
    // And the lease really was renewed: it survives what would have expired it.
    sweep(Date.now() + 50_000)
    expect(presenceOf(ROOM)).toHaveLength(1)
  })

  it('tells the room when an instance that died takes its people with it', () => {
    acceptRemotePresence(
      ROOM,
      [{ userId: 'u-9', name: 'Away', color: '#000', devices: 1 }],
      55_000,
      'other-instance'
    )
    const seen: number[] = []
    const stop = onPresenceChange((_room, users) => seen.push(users.length))
    sweep(Date.now() + 120_000)
    stop()
    expect(seen).toEqual([0])
  })

  it('sweeps away an instance that stopped saying it was there', () => {
    // Nothing of ours in the room, only what another instance claimed.
    acceptRemotePresence(
      ROOM,
      [{ userId: 'u-9', name: 'Away', color: '#000', devices: 1 }],
      55_000,
      'other-instance'
    )
    expect(presenceOf(ROOM)).toHaveLength(1)

    // A minute later it has not repeated itself: it is gone, and so is the room.
    sweep(Date.now() + 120_000)

    expect(presenceOf(ROOM)).toEqual([])
    expect(presenceStats().remoteRooms).toBe(0)
  })
})

describe('a module that is loaded again', () => {
  it('has one timer and one bridge, however many times it is started', async () => {
    // Development reloads the socket route on every edit, and each load starts
    // presence. The predecessor's timer has to go, or old code keeps running
    // beside the new on state the new code wrote.
    vi.useFakeTimers()
    try {
      const { startPresence } = await import('@/lib/realtime/presence.server')
      startPresence()
      const afterFirst = vi.getTimerCount()
      startPresence()
      startPresence()
      expect(vi.getTimerCount()).toBe(afterFirst)
    } finally {
      vi.useRealTimers()
    }
  })
})
