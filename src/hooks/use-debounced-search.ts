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

  // The term currently reflected in the URL, always stored trimmed so it can be
  // compared directly against the server-provided `initial`. Seeded so the
  // first render never re-commits what the server already applied.
  const committedRef = useRef(initial)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearPending = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Adopt genuinely external changes to the URL (back/forward, a filter chip,
  // a reset link).
  //
  // Crucially this must NOT react to the echo of our own commit. Navigation is
  // asynchronous, so characters typed while the server round-trips would be
  // overwritten by the older term coming back down as a prop — the input would
  // visibly drop a letter. Comparing against the last committed term
  // distinguishes "someone else changed the URL" from "our own search landed".
  useEffect(() => {
    if (initial === committedRef.current) return
    committedRef.current = initial
    setValue(initial)
  }, [initial])

  // Debounce on the trimmed term: `committedRef` also holds a trimmed value, so
  // typing a trailing space is not treated as a new search.
  const term = value.trim()

  useEffect(() => {
    if (term === committedRef.current) return

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      committedRef.current = term
      onCommitRef.current(term || undefined)
    }, delayMs)

    return clearPending
  }, [term, delayMs])

  /**
   * Commit immediately, skipping the debounce. Wired to the form's onSubmit so
   * pressing Enter still works; cancelling the pending timer first stops it
   * firing a duplicate navigation a moment later.
   */
  const commitNow = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      clearPending()
      const next = value.trim()
      if (next === committedRef.current) return
      committedRef.current = next
      onCommitRef.current(next || undefined)
    },
    [value],
  )

  return { value, setValue, commitNow }
}
