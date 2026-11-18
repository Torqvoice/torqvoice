'use client'

import { useEffect, useRef } from 'react'
import { boardNow } from '../utils/board-time'

/**
 * Calls `onNewDay` when the workshop's date changes, for a wall display that
 * moves on to the next day by itself.
 *
 * Checked every minute rather than timed to the browser's own midnight, which
 * is a different moment when the screen sits in another zone.
 *
 * The last day acted on lives in a ref, not in the effect. The effect is set
 * up again whenever `onNewDay` changes, and on a live board that is every
 * update another desk makes. Were the day kept inside the effect, an update
 * landing after midnight but before the next tick would start it again on
 * the new date, the change would never be seen, and the screen would show
 * yesterday until the following midnight. For the same reason every set up
 * checks at once rather than waiting a minute.
 */
export function useWorkshopDayRollover(timeZone: string, onNewDay: (dayKey: string) => void) {
  // The day the screen opened on. Nothing is drawn from it, so reading the
  // clock during render cannot make the server and the client disagree.
  const lastDay = useRef<string | null>(null)
  if (lastDay.current === null) lastDay.current = boardNow(timeZone).dayKey

  useEffect(() => {
    const check = () => {
      const today = boardNow(timeZone).dayKey
      if (today === lastDay.current) return
      lastDay.current = today
      onNewDay(today)
    }
    check()
    const timer = setInterval(check, 60_000)
    return () => clearInterval(timer)
  }, [timeZone, onNewDay])
}
