'use client'

import { useEffect, useState } from 'react'

/**
 * A `now` that moves.
 *
 * Anything showing a running clock re-renders on this rather than each row
 * running its own interval. Off entirely while nothing is running, so a
 * sheet of finished days costs no timers at all.
 */
export function useTick(active: boolean, intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [active, intervalMs])
  return now
}
