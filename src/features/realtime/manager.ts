import {
  PRESENCE_HEARTBEAT_MS,
  REALTIME_PATH,
  type ClientMessage,
  type PresenceUser,
  type RecordChange,
  type ServerMessage,
} from '@/lib/realtime/events'

/**
 * The browser's half of the live layer, and the one place that knows what
 * this tab is following.
 *
 * It is a plain class, not a component, for two reasons. Its lifetime is the
 * tab's, not a render's: React mounts, unmounts and re-runs effects as it
 * likes (twice over in development), and a socket whose existence depends on
 * that is a socket that gets lost. And a class can be driven by a test with a
 * pretend socket, which is how the rules below are proven rather than hoped.
 *
 * **What it keeps.** One entry per room (`rooms`), holding everything about
 * it: who is listening for changes, how many components stand in it, and who
 * else is there. An entry exists while
 * something on the page wants the room and is deleted the moment nothing
 * does. There is no second map to fall out of step with it.
 *
 * **What it promises.**
 *
 * - *Wanted, not sent.* Pages say what they want; the manager makes the
 *   server agree. Nothing goes out before the server has said `ready`, and on
 *   every `ready` the whole of what is wanted is said again, so a reconnect
 *   and a first connection are the same code.
 * - *One socket, and only its own events.* Every handler is tied to the
 *   socket it was made for. A socket that was replaced can close as late as
 *   it likes without touching its successor.
 * - *A dead link is found.* A ping that is not answered by the next one is a
 *   lost connection, whatever the browser believes.
 * - *It gives up politely.* Retries back off to five minutes, with jitter so
 *   a deploy is not met by every tab at once, and stop entirely when the
 *   server says the session is gone.
 * - *Nothing is left behind.* `stop()` clears every timer and listener, and
 *   `stats()` is what the tests read to prove it.
 */

export type RecordHandler = (change: RecordChange) => void
export type LegacyChannel = 'notification' | 'workboard' | 'broadcast'
export type LegacyHandler = (data: unknown) => void

export type ConnectionStatus =
  /** Not started, or stopped. */
  | 'idle'
  /** A socket is opening, or open and waiting to be recognised. */
  | 'connecting'
  /** Recognised: everything wanted has been asked for. */
  | 'ready'
  /** Lost, and waiting to try again. */
  | 'waiting'
  /** The server refused the session. Not retried: a sign-in is a page load. */
  | 'refused'

export interface Me {
  userId: string
  name: string
  color: string
}

export interface ManagerState {
  status: ConnectionStatus
  me: Me | null
}

/** The part of a WebSocket this uses, so a test can stand in for one. */
export interface SocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code?: number }) => void) | null
  onerror: ((event: unknown) => void) | null
}

export interface ManagerOptions {
  createSocket?: (url: string) => SocketLike
  url?: () => string
  /** 0..1, for the jitter. Fixed in tests. */
  random?: () => number
}

interface Room {
  /** Listening for record changes. */
  handlers: Set<RecordHandler>
  /** Components that put this person in the room's presence. */
  standing: number
  /** Re-render when the people in the room change. */
  presenceWatchers: Set<() => void>
  /** What this socket has been asked for: the subscription, and presence. */
  asked: boolean
  entered: boolean
  users: PresenceUser[]
}

const OPEN = 1
/** Close codes the server uses for "this session is not valid". */
const REFUSED = new Set([4001])
export const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 120_000, 300_000]
/** Recognition takes two database reads; longer than this is a stuck socket. */
export const READY_TIMEOUT_MS = 15_000

/** Shared, so an empty room is the same array every time it is read. */
const NOBODY: PresenceUser[] = []

export class CollaborationManager {
  private readonly rooms = new Map<string, Room>()
  private readonly resyncWatchers = new Set<() => void>()
  private readonly legacyWatchers = new Map<LegacyChannel, Set<LegacyHandler>>()
  private readonly stateWatchers = new Set<() => void>()

  private state: ManagerState = { status: 'idle', me: null }
  private socket: SocketLike | null = null
  private started = false
  /** True once any socket of this page has been ready: the next is a *re*connect. */
  private wasReady = false
  private attempt = 0
  private awaitingPong = false

  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private readyTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null

  private readonly createSocket: (url: string) => SocketLike
  private readonly url: () => string
  private readonly random: () => number

  constructor(options: ManagerOptions = {}) {
    this.createSocket =
      options.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike)
    this.url =
      options.url ??
      (() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        return `${protocol}//${window.location.host}${REALTIME_PATH}`
      })
    this.random = options.random ?? Math.random
  }

  /* ---------------------------------------------------------- lifetime -- */

  /** Safe to call twice; what pages asked for before it is kept and sent. */
  start(): void {
    if (this.started) return
    this.started = true
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.wake)
      document.addEventListener('visibilitychange', this.wake)
    }
    // A tick later, not now. Development mounts the app shell twice, and a
    // socket opened by the first mount is closed by its cleanup before it has
    // connected: a wasted handshake, and "WebSocket is closed before the
    // connection is established" in every developer's console. A start that
    // is stopped straight away now opens nothing.
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null
      this.connect()
    }, 0)
  }

  /**
   * Closes the socket and clears every timer and listener. What pages want is
   * kept, because they have not stopped wanting it: `start()` picks it up.
   */
  stop(): void {
    if (!this.started) return
    this.started = false
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wake)
      document.removeEventListener('visibilitychange', this.wake)
    }
    this.clearTimers()
    const socket = this.socket
    this.socket = null
    if (socket) this.discard(socket)
    this.forgetServerState()
    this.attempt = 0
    this.setState({ status: 'idle', me: this.state.me })
  }

  /* ------------------------------------------------------ what pages ask -- */

  /** Hear about changes to a room's record. Returns the way to stop. */
  watch(room: string, handler: RecordHandler): () => void {
    const entry = this.roomFor(room)
    entry.handlers.add(handler)
    this.ask(room, entry)
    let stopped = false
    return () => {
      if (stopped) return
      stopped = true
      entry.handlers.delete(handler)
      this.release(room, entry)
    }
  }

  /**
   * Stand in a room, which is what puts this person in everyone else's chips.
   * Counted: two components on one page are one presence, gone when the last
   * of them is.
   */
  join(room: string): () => void {
    const entry = this.roomFor(room)
    entry.standing++
    this.ask(room, entry)
    this.enter(room, entry)
    let left = false
    return () => {
      if (left) return
      left = true
      entry.standing--
      if (entry.standing === 0) {
        if (entry.entered) this.send({ t: 'leave', room })
        entry.entered = false
      }
      this.release(room, entry)
    }
  }

  /** The people in a room, as last told. The same array until it changes. */
  presenceOf(room: string): PresenceUser[] {
    return this.rooms.get(room)?.users ?? NOBODY
  }

  /** For useSyncExternalStore. Watching alone does not hold the room. */
  watchPresence(room: string, onChange: () => void): () => void {
    const entry = this.roomFor(room)
    entry.presenceWatchers.add(onChange)
    return () => {
      entry.presenceWatchers.delete(onChange)
      this.release(room, entry)
    }
  }

  /** Called after a *re*connection, when changes may have been missed. */
  onResync(handler: () => void): () => void {
    this.resyncWatchers.add(handler)
    return () => {
      this.resyncWatchers.delete(handler)
    }
  }

  /** The old workshop-wide channels, until every page has moved to rooms. */
  onLegacy(channel: LegacyChannel, handler: LegacyHandler): () => void {
    const handlers = this.legacyWatchers.get(channel) ?? new Set<LegacyHandler>()
    handlers.add(handler)
    this.legacyWatchers.set(channel, handlers)
    return () => {
      handlers.delete(handler)
      if (handlers.size === 0) this.legacyWatchers.delete(channel)
    }
  }

  getState = (): ManagerState => this.state

  watchState = (onChange: () => void): (() => void) => {
    this.stateWatchers.add(onChange)
    return () => {
      this.stateWatchers.delete(onChange)
    }
  }

  /** What is being held right now. The tests read this to prove nothing leaks. */
  stats(): {
    rooms: number
    handlers: number
    standing: number
    presenceWatchers: number
    resyncWatchers: number
    legacyWatchers: number
    stateWatchers: number
    timers: number
    socket: boolean
  } {
    let handlers = 0
    let standing = 0
    let presenceWatchers = 0
    for (const room of this.rooms.values()) {
      handlers += room.handlers.size
      standing += room.standing
      presenceWatchers += room.presenceWatchers.size
    }
    let legacyWatchers = 0
    for (const set of this.legacyWatchers.values()) legacyWatchers += set.size
    const timers = [this.connectTimer, this.retryTimer, this.readyTimer, this.heartbeat].filter(
      (timer) => timer !== null
    ).length
    return {
      rooms: this.rooms.size,
      handlers,
      standing,
      presenceWatchers,
      resyncWatchers: this.resyncWatchers.size,
      legacyWatchers,
      stateWatchers: this.stateWatchers.size,
      timers,
      socket: this.socket !== null,
    }
  }

  /* ---------------------------------------------------------------- rooms -- */

  private roomFor(room: string): Room {
    let entry = this.rooms.get(room)
    if (!entry) {
      entry = {
        handlers: new Set(),
        standing: 0,
        presenceWatchers: new Set(),
        asked: false,
        entered: false,
        users: NOBODY,
      }
      this.rooms.set(room, entry)
    }
    return entry
  }

  /** Held means the server should have this socket in the room. */
  private isHeld(entry: Room): boolean {
    return entry.handlers.size > 0 || entry.standing > 0
  }

  private ask(room: string, entry: Room): void {
    if (entry.asked) return
    if (this.send({ t: 'sub', rooms: [room] })) entry.asked = true
  }

  /** After something let go: tell the server, and drop the entry when it is empty. */
  private release(room: string, entry: Room): void {
    if (this.rooms.get(room) !== entry) return
    if (this.isHeld(entry)) return
    if (entry.asked) this.send({ t: 'unsub', rooms: [room] })
    entry.asked = false
    entry.entered = false
    if (entry.users !== NOBODY) {
      entry.users = NOBODY
      for (const watcher of [...entry.presenceWatchers]) watcher()
    }
    if (entry.presenceWatchers.size === 0) this.rooms.delete(room)
  }

  private enter(room: string, entry: Room): void {
    if (entry.entered) return
    if (this.send({ t: 'enter', room })) entry.entered = true
  }

  /** Everything wanted, said again: the first thing done on every `ready`. */
  private sayWhatIsWanted(): void {
    const held: string[] = []
    for (const [room, entry] of this.rooms) {
      if (!this.isHeld(entry)) continue
      held.push(room)
      entry.asked = true
    }
    if (held.length > 0) this.send({ t: 'sub', rooms: held })
    for (const [room, entry] of this.rooms) {
      if (entry.standing > 0) this.enter(room, entry)
    }
  }

  /** A new socket knows nothing the old one was told. */
  private forgetServerState(): void {
    for (const entry of this.rooms.values()) {
      entry.asked = false
      entry.entered = false
      if (entry.users !== NOBODY) {
        entry.users = NOBODY
        for (const watcher of [...entry.presenceWatchers]) watcher()
      }
    }
  }

  /* --------------------------------------------------------------- socket -- */

  private send(message: ClientMessage): boolean {
    const socket = this.socket
    if (!socket || this.state.status !== 'ready' || socket.readyState !== OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }

  private connect(): void {
    if (!this.started || this.socket) return
    let socket: SocketLike
    try {
      socket = this.createSocket(this.url())
    } catch {
      this.retryLater()
      return
    }
    this.socket = socket
    this.setState({ status: 'connecting', me: this.state.me })

    // If the server never says `ready`, this is not a connection worth keeping.
    this.readyTimer = setTimeout(() => {
      this.readyTimer = null
      if (this.socket === socket && this.state.status !== 'ready') this.lost(socket)
    }, READY_TIMEOUT_MS)

    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      this.awaitingPong = false
      this.receive(event.data)
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.lost(socket, event?.code)
    }
    socket.onerror = () => {
      if (this.socket !== socket) return
      this.lost(socket)
    }
  }

  /** Detaches a socket so that nothing it does later reaches this manager. */
  private discard(socket: SocketLike): void {
    socket.onopen = null
    socket.onmessage = null
    socket.onclose = null
    socket.onerror = null
    try {
      socket.close()
    } catch {
      /* already gone */
    }
  }

  /** The one way a connection ends, however it ended. */
  private lost(socket: SocketLike, code?: number): void {
    if (this.socket !== socket) return
    this.socket = null
    this.discard(socket)
    this.clearTimers()
    this.forgetServerState()
    if (code !== undefined && REFUSED.has(code)) {
      this.setState({ status: 'refused', me: null })
      return
    }
    this.retryLater()
  }

  private retryLater(): void {
    if (!this.started) return
    this.setState({ status: 'waiting', me: this.state.me })
    const base = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)]
    this.attempt++
    // Up to a fifth either way, so a restart is not met by every tab at once.
    const delay = Math.round(base * (0.8 + this.random() * 0.4))
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.connect()
    }, delay)
  }

  /** The network came back, or the tab was looked at again. */
  private wake = (): void => {
    if (!this.started) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (this.state.status === 'waiting') {
      if (this.retryTimer) clearTimeout(this.retryTimer)
      this.retryTimer = null
      this.attempt = 0
      this.connect()
      return
    }
    // A laptop that slept believes its socket is fine. Ask.
    if (this.state.status === 'ready' && !this.awaitingPong) this.beat()
  }

  private beat = (): void => {
    const socket = this.socket
    if (!socket || this.state.status !== 'ready') return
    // Counted in beats, not in seconds: a hidden tab's timers are slowed to
    // one a minute, and a clock would call that a dead link every time.
    if (this.awaitingPong) {
      this.lost(socket)
      return
    }
    this.awaitingPong = true
    this.send({ t: 'ping' })
  }

  private clearTimers(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer)
    if (this.retryTimer) clearTimeout(this.retryTimer)
    if (this.readyTimer) clearTimeout(this.readyTimer)
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.connectTimer = null
    this.retryTimer = null
    this.readyTimer = null
    this.heartbeat = null
    this.awaitingPong = false
  }

  /* ------------------------------------------------------------- incoming -- */

  private receive(raw: unknown): void {
    let message: ServerMessage
    try {
      message = JSON.parse(String(raw)) as ServerMessage
    } catch {
      return
    }
    switch (message?.t) {
      case 'ready': {
        if (this.readyTimer) clearTimeout(this.readyTimer)
        this.readyTimer = null
        this.attempt = 0
        this.setState({ status: 'ready', me: message.you })
        if (!this.heartbeat) this.heartbeat = setInterval(this.beat, PRESENCE_HEARTBEAT_MS)
        this.sayWhatIsWanted()
        // The first connection of a page has nothing to catch up on: the page
        // was rendered a moment ago. Every later one missed whatever happened
        // while the link was down, and no screen may keep showing what it had.
        if (this.wasReady) for (const watcher of [...this.resyncWatchers]) watcher()
        this.wasReady = true
        return
      }
      case 'record': {
        const { change } = message
        const room = change.id ? `rec:${change.kind}:${change.id}` : `org:${change.organizationId}`
        for (const handler of [...(this.rooms.get(room)?.handlers ?? [])]) handler(change)
        return
      }
      case 'presence': {
        // A frame for a room this page has left is not kept: it would be an
        // entry nothing ever deletes.
        const entry = this.rooms.get(message.room)
        if (!entry || !this.isHeld(entry)) return
        entry.users = message.users.length > 0 ? message.users : NOBODY
        for (const watcher of [...entry.presenceWatchers]) watcher()
        return
      }
      case 'legacy': {
        for (const handler of [...(this.legacyWatchers.get(message.channel) ?? [])]) {
          handler(message.data)
        }
        return
      }
      default:
        return
    }
  }

  private setState(next: ManagerState): void {
    if (next.status === this.state.status && next.me?.userId === this.state.me?.userId) return
    this.state = next
    for (const watcher of [...this.stateWatchers]) watcher()
  }
}
