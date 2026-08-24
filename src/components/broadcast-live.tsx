'use client'

import { useEffect } from 'react'
import { setLiveBroadcast } from './broadcast-store'
import type { Broadcast } from '@/lib/broadcast'

/**
 * Listens for a notice posted while somebody is already looking at a screen.
 *
 * Mounted from the authenticated layout rather than beside the banner, because
 * the socket authenticates on the session cookie: from the sign-in page it
 * would only ever fail and retry. Someone signed out still sees the notice,
 * just on the page they load rather than the moment it is posted.
 *
 * A socket of its own, not the notification one. That is mounted for owners
 * and admins only, and an outage notice has to reach the technician in the bay
 * as much as the person who owns the shop.
 */
export function BroadcastLive() {
  useEffect(() => {
    // Liveness as a closure, not a ref: StrictMode remounts in dev, and a ref
    // lets the old socket's onclose schedule a reconnect against the new run,
    // leaving two sockets open.
    let alive = true
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | undefined
    // Backs off so a server that is down, which is exactly when a notice gets
    // posted, does not get hammered by every open tab in every workshop.
    let attempt = 0

    const connect = () => {
      if (!alive) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(`${protocol}//${window.location.host}/api/protected/ws`)

      socket.onopen = () => {
        attempt = 0
      }

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type !== 'broadcast') return
          setLiveBroadcast((message.data as Broadcast | null) ?? null)
        } catch {
          // Someone else's frame, or a truncated one. Not ours to report.
        }
      }

      socket.onclose = () => {
        if (!alive) return
        attempt += 1
        retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempt))
      }
    }

    connect()

    return () => {
      alive = false
      clearTimeout(retry)
      socket?.close()
    }
  }, [])

  return null
}
