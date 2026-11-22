import { useCallback, useRef } from 'react'

/**
 * A function that never changes identity and always runs the newest version
 * of `callback`.
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
  latest.current = callback
  return useCallback((...args: Args) => latest.current(...args), [])
}
