'use client'

import { useEffect, useRef } from 'react'

/**
 * Waits for a technician's phone to come through, while the desk holds the QR.
 *
 * The dialog is showing a code to somebody standing on the other side of a
 * phone, so the only person who can see whether it worked is the one not
 * looking at this screen. Rather than have the desk guess and close it, the
 * scan itself ends the dialog.
 *
 * Open only while a code is on screen. The connection costs nothing the rest
 * of the time and would be one more socket held open on a page nobody is
 * using.
 */
export function useTechnicianConnected(userId: string | null, onConnected: () => void) {
  // Read through a ref, so a caller passing a fresh closure on every render
  // does not tear the socket down and build it again.
  const handler = useRef(onConnected)
  useEffect(() => {
    handler.current = onConnected
  }, [onConnected])

  useEffect(() => {
    if (!userId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/protected/ws`)

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type !== 'workboard') return
        const data = message.data as { type?: string; userId?: string }
        if (data.type !== 'technician_app_connected') return
        // Somebody else being set up at the same counter is not this dialog's
        // business.
        if (data.userId !== userId) return
        handler.current()
      } catch {
        /* a frame we do not understand is not worth breaking the dialog over */
      }
    }

    return () => {
      // Deliberately no reconnect. This lives as long as one dialog, and a
      // socket that kept coming back would outlive the thing that wanted it.
      ws.close()
    }
  }, [userId])
}
