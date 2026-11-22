import { useCallback, useInsertionEffect, useRef } from 'react'

/**
 * A function that never changes identity and always runs the version of
 * `callback` from the render that is on screen.
 *
 * For a handler handed to a memoized child: an inline arrow is a new function
 * on every render, which makes the child render again although nothing it
 * shows has changed. Only for functions called from events, timers and
 * effects, never while rendering.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result
): (...args: Args) => Result {
  const latest = useRef(callback)
  // Swapped in when the render commits, before any other effect runs, never
  // while rendering: a render React starts and then abandons (a transition
  // that suspends or is interrupted) must not leave its handlers behind for
  // the page that is still showing.
  useInsertionEffect(() => {
    latest.current = callback
  })
  return useCallback((...args: Args) => latest.current(...args), [])
}
