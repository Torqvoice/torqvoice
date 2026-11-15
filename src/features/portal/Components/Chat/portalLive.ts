'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { portalRealtimePath } from '@/lib/realtime/events'

/**
 * The portal's live line to the workshop: one socket per page, which says
 * nothing but "your thread changed". Whoever is listening (the chat, the
 * unread badge) answers by reading again through its own query, so the
 * socket carries no message and decides nothing about what a customer sees.
 *
 * The socket is an improvement, never a requirement. Where it cannot be
 * opened (a proxy that does not pass WebSocket, an older server) the chat
 * and the badge keep polling as they did, and nothing on the page shows an
 * error. While it is open they poll rarely, only as a safety net.
 *
 * - One socket however many components listen, opened with the first
 *   listener and closed with the last.
 * - A lost socket is tried again after 1, 2, 5, 10, 30 and then every 60
 *   seconds, with jitter so a deploy is not met by every customer at once,
 *   and at once when the tab comes back to the front or the network returns.
 * - Every (re)connection counts as a signal: something may have changed
 *   while nobody was listening.
 * - A server that says the session is gone is not asked again: signing in
 *   is a page load.
 */

/** The part of a WebSocket this uses, so a test can stand in for one. */
export interface PortalSocketLike {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code?: number }) => void) | null
  onerror: ((event: unknown) => void) | null
}

type SocketFactory = (url: string) => PortalSocketLike | null

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000]
/** The session was refused: do not come back. */
const REFUSED = 4001
/** Says "still here", so a proxy does not close a quiet connection. */
const PING_EVERY_MS = 25_000

const browserSocket: SocketFactory = (url) => {
  // Under test there is no server to reach, and a real connection attempt
  // from every rendered page would only be noise.
  if (process.env.NODE_ENV === 'test') return null
  if (typeof WebSocket === 'undefined') return null
  return new WebSocket(url) as unknown as PortalSocketLike
}
let createSocket: SocketFactory = browserSocket

/** Only for tests: stands a pretend socket in for the browser's. */
export function setPortalSocketFactory(factory: SocketFactory | null): void {
  createSocket = factory ?? browserSocket
}

class PortalLine {
  private socket: PortalSocketLike | null = null
  private connected = false
  private refused = false
  private attempt = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private ping: ReturnType<typeof setInterval> | null = null
  private readonly signalListeners = new Set<() => void>()
  private readonly stateListeners = new Set<() => void>()

  constructor(private readonly orgParam: string) {}

  isConnected = (): boolean => this.connected

  watchState = (listener: () => void): (() => void) => {
    this.stateListeners.add(listener)
    return () => {
      this.stateListeners.delete(listener)
    }
  }

  /** Listens for "something changed". The first listener opens the socket. */
  listen(onSignal: () => void): () => void {
    this.signalListeners.add(onSignal)
    if (this.signalListeners.size === 1) this.start()
    return () => {
      this.signalListeners.delete(onSignal)
      if (this.signalListeners.size === 0) this.stop()
    }
  }

  private start(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.wake)
      document.addEventListener('visibilitychange', this.wake)
    }
    this.open()
  }

  private stop(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.wake)
      document.removeEventListener('visibilitychange', this.wake)
    }
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.attempt = 0
    this.drop()
  }

  /** The tab is in front again, or the network is back: do not wait out the delay. */
  private wake = (): void => {
    if (this.socket || this.refused) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    this.open()
  }

  private open(): void {
    if (this.socket || this.refused || this.signalListeners.size === 0) return
    let socket: PortalSocketLike | null = null
    try {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
      socket = createSocket(
        `${scheme}://${window.location.host}${portalRealtimePath(this.orgParam)}`
      )
    } catch {
      socket = null
    }
    // No socket to be had here: the page polls, as it always could.
    if (!socket) return
    this.socket = socket

    // Every handler is tied to the socket it was made for, so one that was
    // replaced can close as late as it likes without touching its successor.
    socket.onmessage = (event) => {
      if (this.socket !== socket) return
      let type: unknown
      try {
        type = (JSON.parse(String(event.data)) as { t?: unknown })?.t
      } catch {
        return
      }
      if (type === 'ready') {
        this.attempt = 0
        this.setConnected(true)
        // Whatever happened while nobody was listening.
        this.signal()
      } else if (type === 'thread') {
        this.signal()
      }
    }
    socket.onclose = (event) => {
      if (this.socket !== socket) return
      this.socket = null
      if (this.ping) clearInterval(this.ping)
      this.ping = null
      this.setConnected(false)
      if (event?.code === REFUSED) {
        this.refused = true
        return
      }
      this.again()
    }
    // A close always follows an error; that is where it is handled.
    socket.onerror = () => undefined
    socket.onopen = () => {
      if (this.socket !== socket) return
      this.ping = setInterval(() => {
        try {
          if (socket.readyState === 1) socket.send('{"t":"ping"}')
        } catch {
          /* a socket that cannot be written to closes by itself */
        }
      }, PING_EVERY_MS)
    }
  }

  private again(): void {
    if (this.signalListeners.size === 0 || this.retry) return
    const base = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)]
    this.attempt++
    this.retry = setTimeout(
      () => {
        this.retry = null
        this.open()
      },
      base + Math.random() * base * 0.3
    )
  }

  private drop(): void {
    const socket = this.socket
    this.socket = null
    if (this.ping) clearInterval(this.ping)
    this.ping = null
    this.setConnected(false)
    try {
      socket?.close(1000, 'Page closed')
    } catch {
      /* already gone */
    }
  }

  private setConnected(connected: boolean): void {
    if (this.connected === connected) return
    this.connected = connected
    for (const listener of [...this.stateListeners]) listener()
  }

  private signal(): void {
    for (const listener of [...this.signalListeners]) {
      try {
        listener()
      } catch {
        /* one listener failing must not silence the others */
      }
    }
  }
}

/** One line per workshop address; a page only ever has one. */
const lines = new Map<string, PortalLine>()
function lineFor(orgParam: string): PortalLine {
  let line = lines.get(orgParam)
  if (!line) {
    line = new PortalLine(orgParam)
    lines.set(orgParam, line)
  }
  return line
}

/** Only for tests: forget every line. */
export function resetPortalLines(): void {
  lines.clear()
}

const never = () => false

/**
 * Listens on the portal's live line. `onSignal` runs when the customer's
 * thread changed and whenever the line (re)connects. Returns whether the
 * line is open right now, for deciding how often to poll.
 */
export function usePortalLive(orgParam: string, onSignal: () => void): boolean {
  const handler = useRef(onSignal)
  useEffect(() => {
    handler.current = onSignal
  }, [onSignal])

  const line = lineFor(orgParam)
  useEffect(() => line.listen(() => handler.current()), [line])
  return useSyncExternalStore(line.watchState, line.isConnected, never)
}
