'use client'

import { useEffect } from 'react'
import { useRealtime } from '@/features/realtime/RealtimeProvider'
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
 * On the app's one socket (features/realtime), which every signed-in person
 * holds, technician in the bay included: an outage notice is the one thing
 * here that ignores which workshop you are in.
 */
export function BroadcastLive() {
  const realtime = useRealtime()

  useEffect(() => {
    if (!realtime) return
    return realtime.onLegacy('broadcast', (data) => {
      setLiveBroadcast((data as Broadcast | null) ?? null)
    })
  }, [realtime])

  return null
}
