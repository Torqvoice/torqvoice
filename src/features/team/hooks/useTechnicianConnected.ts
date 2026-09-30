'use client'

import { useEffect, useRef } from 'react'
import { useRealtime } from '@/features/realtime/RealtimeProvider'

/**
 * Waits for a technician's phone to come through, while the desk holds the QR.
 *
 * The dialog is showing a code to somebody standing on the other side of a
 * phone, so the only person who can see whether it worked is the one not
 * looking at this screen. Rather than have the desk guess and close it, the
 * scan itself ends the dialog.
 *
 * Listens on the app's one socket for as long as a code is on screen, and
 * stops when the dialog closes: it used to open a WebSocket of its own.
 */
export function useTechnicianConnected(userId: string | null, onConnected: () => void) {
  // Read through a ref, so a caller passing a fresh closure on every render
  // does not tear the socket down and build it again.
  const handler = useRef(onConnected)
  useEffect(() => {
    handler.current = onConnected
  }, [onConnected])

  const realtime = useRealtime()
  useEffect(() => {
    if (!userId || !realtime) return
    return realtime.onLegacy('workboard', (raw) => {
      const data = raw as { type?: string; userId?: string }
      if (data?.type !== 'technician_app_connected') return
      // Somebody else being set up at the same counter is not this dialog's
      // business.
      if (data.userId !== userId) return
      handler.current()
    })
  }, [userId, realtime])
}
