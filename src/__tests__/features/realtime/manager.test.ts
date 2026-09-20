/**
 * The collaboration manager, driven with a pretend socket.
 *
 * Every test here is a fault this feature actually had, or a promise it makes
 * about memory. The first version passed fifty-two tests and did nothing in a
 * browser, because the things that broke it only exist between a socket and
 * the code holding it: a frame sent before the server was listening, an old
 * socket closing late and taking its successor's place with it. So the socket
 * here is a stand-in that behaves like the real one where it matters: it
 * closes asynchronously, and it remembers exactly what was sent and when.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CollaborationManager,
  READY_TIMEOUT_MS,
  RETRY_MS,
  type SocketLike,
} from '@/features/realtime/manager'
import { PRESENCE_HEARTBEAT_MS, type PresenceUser } from '@/lib/realtime/events'

class PretendSocket implements SocketLike {
  readyState = 1
  sent: { t: string; [key: string]: unknown }[] = []
  onopen: SocketLike['onopen'] = null
  onmessage: SocketLike['onmessage'] = null
  onclose: SocketLike['onclose'] = null
  onerror: SocketLike['onerror'] = null
  closedByPage = false

  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.closedByPage = true
    this.readyState = 3
  }
  /** What the server would say. */
  say(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
  ready() {
    this.say({ t: 'ready', you: { userId: 'u-1', name: 'Christian', color: '#2563eb' } })
  }
  /** The link going away, as the browser reports it. */
  drop(code = 1006) {
    this.readyState = 3
    this.onclose?.({ code })
  }
  types() {
    return this.sent.map((message) => message.t)
  }
}

const ROOM = 'rec:serviceRecord:job-1'
const MARCO: PresenceUser = {
  userId: 'u-2',
  name: 'Marco',
  color: '#db2777',
  devices: 1,
}

let sockets: PretendSocket[]
let manager: CollaborationManager

const latest = () => sockets[sockets.length - 1]
/** Starts it and lets the tick pass that it waits before connecting. */
const begin = () => {
  manager.start()
  vi.advanceTimersByTime(0)
}

beforeEach(() => {
  vi.useFakeTimers()
  sockets = []
  manager = new CollaborationManager({
    url: () => 'ws://test/api/protected/ws',
    random: () => 0.5,
    createSocket: () => {
      const socket = new PretendSocket()
      sockets.push(socket)
      return socket
    },
  })
})

afterEach(() => {
  manager.stop()
  vi.useRealTimers()
})

describe('saying what the page wants', () => {
  it('sends nothing until the server is listening, then all of it in order', () => {
    // The server reads the session before it listens. Anything sent in that
    // window used to be dropped, which is why nobody's chip ever appeared.
    manager.watch(ROOM, () => undefined)
    manager.join(ROOM)
    begin()

    expect(latest().sent).toEqual([])

    latest().ready()

    expect(latest().sent).toEqual([
      { t: 'sub', rooms: [ROOM] },
      { t: 'enter', room: ROOM },
    ])
  })

  it('asks at once for a room wanted after the link is up', () => {
    begin()
    latest().ready()

    manager.join(ROOM)

    expect(latest().sent).toEqual([
      { t: 'sub', rooms: [ROOM] },
      { t: 'enter', room: ROOM },
    ])
  })

  it('counts a room wanted twice as one room', () => {
    begin()
    latest().ready()

    const leaveChips = manager.join(ROOM)
    const leaveFocus = manager.join(ROOM)
    const stopWatching = manager.watch(ROOM, () => undefined)
    expect(latest().types()).toEqual(['sub', 'enter'])

    leaveChips()
    stopWatching()
    expect(latest().types()).toEqual(['sub', 'enter'])

    leaveFocus()
    expect(latest().types()).toEqual(['sub', 'enter', 'leave', 'unsub'])
    expect(manager.stats().rooms).toBe(0)
  })
})

describe('one socket, and only its own events', () => {
  it('opens one socket when React mounts it twice', () => {
    // Development runs every effect twice: start, stop, start, all in one
    // tick. The first start used to open a socket only for the cleanup to
    // close it mid-handshake, which Chrome reports as "WebSocket is closed
    // before the connection is established".
    manager.join(ROOM)
    manager.start()
    manager.stop()
    manager.start()
    vi.advanceTimersByTime(0)

    expect(sockets).toHaveLength(1)
    latest().ready()
    expect(latest().types()).toEqual(['sub', 'enter'])
  })

  it('is not taken down by an earlier socket that closes late', () => {
    // A stop and a start a moment apart, as a fast remount is. The first
    // socket reports its close afterwards; it used to clear the shared
    // reference on its way out, leaving the second open and unreachable.
    manager.join(ROOM)
    begin()
    const first = latest()
    manager.stop()
    begin()
    const second = latest()
    expect(second).not.toBe(first)

    first.onclose?.({ code: 1000 })
    second.ready()

    expect(first.closedByPage).toBe(true)
    expect(second.types()).toEqual(['sub', 'enter'])
    expect(manager.getState().status).toBe('ready')
    expect(sockets).toHaveLength(2)
  })
})

describe('a link that goes away', () => {
  it('comes back, says everything again, and tells pages to read again', () => {
    const resync = vi.fn()
    manager.onResync(resync)
    manager.join(ROOM)
    begin()
    latest().ready()
    // A page rendered a moment ago has nothing to catch up on.
    expect(resync).not.toHaveBeenCalled()

    latest().drop()
    expect(manager.getState().status).toBe('waiting')
    vi.advanceTimersByTime(RETRY_MS[0] * 1.2)
    expect(sockets).toHaveLength(2)
    latest().ready()

    expect(latest().sent).toEqual([
      { t: 'sub', rooms: [ROOM] },
      { t: 'enter', room: ROOM },
    ])
    expect(resync).toHaveBeenCalledTimes(1)
  })

  it('empties the chips while it is down, rather than showing who was there', () => {
    const changed = vi.fn()
    manager.join(ROOM)
    manager.watchPresence(ROOM, changed)
    begin()
    latest().ready()
    latest().say({ t: 'presence', room: ROOM, users: [MARCO] })
    expect(manager.presenceOf(ROOM)).toEqual([MARCO])

    latest().drop()

    expect(manager.presenceOf(ROOM)).toEqual([])
    expect(changed).toHaveBeenCalledTimes(2)
  })

  it('does not hammer a server that stays down', () => {
    begin()
    // Ten minutes of a server that refuses every connection.
    const until = Date.now() + 10 * 60_000
    while (Date.now() < until) {
      latest().drop()
      vi.advanceTimersByTime(1_000)
      while (sockets.length > 0 && latest().readyState !== 1 && Date.now() < until) {
        vi.advanceTimersByTime(1_000)
      }
    }
    // 1, 2, 5, 10, 30, 60, 120 seconds, then one every five minutes.
    expect(sockets.length).toBeLessThanOrEqual(10)
  })

  it('stops for good when the server says the session is gone', () => {
    begin()
    latest().drop(4001)

    vi.advanceTimersByTime(60 * 60_000)

    expect(sockets).toHaveLength(1)
    expect(manager.getState().status).toBe('refused')
    expect(manager.stats().timers).toBe(0)
  })

  it('gives up on a socket the server never recognises', () => {
    begin()
    vi.advanceTimersByTime(READY_TIMEOUT_MS + 1)

    expect(sockets[0].closedByPage).toBe(true)
    expect(manager.getState().status).toBe('waiting')
  })

  it('finds a dead link by a ping nobody answered', () => {
    begin()
    latest().ready()

    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS)
    expect(latest().types()).toEqual(['ping'])
    latest().say({ t: 'pong' })
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS)
    expect(manager.getState().status).toBe('ready')

    // This one is never answered.
    vi.advanceTimersByTime(PRESENCE_HEARTBEAT_MS)

    expect(manager.getState().status).toBe('waiting')
    expect(sockets[0].closedByPage).toBe(true)
  })
})

describe('what it hears', () => {
  it('hands a change to the room it belongs to, and to nobody else', () => {
    const mine = vi.fn()
    const other = vi.fn()
    manager.watch(ROOM, mine)
    manager.watch('rec:serviceRecord:job-2', other)
    begin()
    latest().ready()

    latest().say({
      t: 'record',
      change: { kind: 'serviceRecord', id: 'job-1', organizationId: 'org-1', action: 'updated' },
    })

    expect(mine).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  it('hands back the same list of people until it changes', () => {
    // useSyncExternalStore compares by identity: a fresh array each read is
    // "changed again", and React renders until it gives up.
    manager.join(ROOM)
    begin()
    latest().ready()
    expect(manager.presenceOf(ROOM)).toBe(manager.presenceOf(ROOM))
    expect(manager.presenceOf('rec:serviceRecord:never')).toBe(manager.presenceOf(ROOM))

    latest().say({ t: 'presence', room: ROOM, users: [MARCO] })
    expect(manager.presenceOf(ROOM)).toBe(manager.presenceOf(ROOM))
  })

  it('survives a frame it cannot read', () => {
    begin()
    latest().ready()
    latest().onmessage?.({ data: 'not json' })
    latest().say({ t: 'something new' })
    expect(manager.getState().status).toBe('ready')
  })
})

describe('leaving nothing behind', () => {
  it('holds nothing after a thousand records are opened and closed', () => {
    begin()
    latest().ready()

    for (let i = 0; i < 1_000; i++) {
      const room = `rec:serviceRecord:job-${i}`
      const stopWatching = manager.watch(room, () => undefined)
      const leave = manager.join(room)
      const stopPresence = manager.watchPresence(room, () => undefined)
      latest().say({ t: 'presence', room, users: [MARCO] })
      stopPresence()
      leave()
      stopWatching()
    }

    expect(manager.stats()).toMatchObject({
      rooms: 0,
      handlers: 0,
      standing: 0,
      presenceWatchers: 0,
    })
  })

  it('does not keep a frame about a room the page has left', () => {
    begin()
    latest().ready()
    manager.join(ROOM)()

    latest().say({ t: 'presence', room: ROOM, users: [MARCO] })

    expect(manager.stats().rooms).toBe(0)
    expect(manager.presenceOf(ROOM)).toEqual([])
  })

  it('clears every timer and the socket when it stops', () => {
    manager.join(ROOM)
    begin()
    latest().ready()
    expect(manager.stats().timers).toBeGreaterThan(0)

    manager.stop()

    expect(manager.stats()).toMatchObject({ timers: 0, socket: false })
    expect(latest().closedByPage).toBe(true)
    // And nothing fires afterwards.
    vi.advanceTimersByTime(60 * 60_000)
    expect(sockets).toHaveLength(1)
  })

  it('unsubscribing twice is the same as once', () => {
    begin()
    latest().ready()
    const leaveA = manager.join(ROOM)
    const leaveB = manager.join(ROOM)

    leaveA()
    leaveA()

    expect(manager.stats().standing).toBe(1)
    leaveB()
    expect(manager.stats().rooms).toBe(0)
  })
})
