'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/** Delay before a pause in typing triggers a search. */
const DEFAULT_DELAY_MS = 350

/**
 * Live-search input state for the list pages.
 *
 * These pages previously wrapped a bare `<Input>` in a `<form onSubmit>`, so
 * the only way to run a search was to press Enter — with no submit button and
 * no visible affordance. In practice people typed, saw nothing happen, and
 * clicked the field repeatedly; the inventory search alone was the single
 * largest source of rage-clicks in the app.
 *
 * This hook keeps the input responsive on every keystroke while pushing the
 * committed value through the caller's existing URL-param navigation after a
 * short pause, so pagination/sort handling is unchanged.
 *
 * @param initial   Search term from the URL (server-rendered).
 * @param onCommit  Applies the term — typically `navigate({ search: term })`.
 */
export function useDebouncedSearch(
  initial: string,
  onCommit: (term: string | undefined) => void,
  delayMs: number = DEFAULT_DELAY_MS,
) {
  const [value, setValue] = useState(initial)

  // Keep the callback in a ref so a caller passing an inline arrow function
  // doesn't restart the timer on every render.
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  // The term currently reflected in the URL. Seeded with the initial value so
  // the first render never re-commits what the server already applied.
  const committedRef = useRef(initial)

  // Adopt external changes to the URL (back/forward, filter chips, reset).
  useEffect(() => {
    committedRef.current = initial
    setValue(initial)
  }, [initial])

  useEffect(() => {
    if (value === committedRef.current) return

    const timer = setTimeout(() => {
      committedRef.current = value
      onCommitRef.current(value.trim() || undefined)
    }, delayMs)

    return () => clearTimeout(timer)
  }, [value, delayMs])

  /**
   * Commit immediately, skipping the debounce. Wired to the form's onSubmit so
   * pressing Enter still works and never double-fires.
   */
  const commitNow = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    committedRef.current = value
    onCommitRef.current(value.trim() || undefined)
  }, [value])

  return { value, setValue, commitNow }
}
