'use client'

import { useCallback, useEffect, useRef } from 'react'

/** Delay before a pause in typing counts as having finished the value. */
export const DEFAULT_COMMIT_DELAY_MS = 400

/**
 * Runs work once a burst of typing stops.
 *
 * For fields derived from another field that updates on every keystroke. The
 * parts editor derives a margin from cost and price: entering a cost of 1500
 * against a price of 1000 passes through 1, and a margin honestly reported
 * from a cost of 1 reads 99900%, so the field flashes 99900, 6566.7 and 566.7
 * before settling. Each is arithmetically right for the digits on screen at
 * the time, and all three look broken.
 *
 * Waiting for a pause rather than for the field to be left keeps the update
 * automatic; `flush` covers leaving early, when there is nothing left to wait
 * for.
 */
export function useDeferredCommit(delayMs: number = DEFAULT_COMMIT_DELAY_MS) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<(() => void) | null>(null)

  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
  }, [])

  const schedule = useCallback(
    (work: () => void) => {
      if (timer.current) clearTimeout(timer.current)
      pending.current = work
      timer.current = setTimeout(() => {
        timer.current = null
        const queued = pending.current
        pending.current = null
        queued?.()
      }, delayMs)
    },
    [delayMs]
  )

  /** Run the pending work now, if any. */
  const flush = useCallback(() => {
    const queued = pending.current
    cancel()
    queued?.()
  }, [cancel])

  // A row unmounted mid-edit must not fire a state update afterwards.
  useEffect(() => cancel, [cancel])

  return { schedule, cancel, flush }
}
