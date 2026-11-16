'use client'

import { type MutableRefObject, useCallback, useEffect, useRef, useState } from 'react'

/** The link a refused save held back, and why it was refused. */
export type BlockedLeave = { anchor: HTMLAnchorElement; reason: string | null }

type Options = {
  /** There are edits on the page that no save has taken yet. */
  active: boolean
  /** Read at the moment of asking: still unsaved after the save ran. */
  isDirty: () => boolean
  isSaving: () => boolean
  save: () => Promise<unknown>
  /** Why the last save was refused, as the save said it. */
  lastErrorRef: MutableRefObject<string | null>
  /**
   * True while a link waits on its save. The page reads it to keep a refusal
   * out of a toast or an error box: it goes into the leave dialog instead.
   */
  leavingRef: MutableRefObject<boolean>
  /** Drop the unsaved edits: stop the autosave and clear the unsaved mark. */
  discard: () => void
}

/**
 * Leaving an editor by a link saves first.
 *
 * An autosave waits a few seconds after the last edit, and the beforeunload
 * warning only covers leaving the site: an edit followed at once by a click
 * on the sidebar went nowhere, and in-app navigation raised no warning about
 * it. So a click on any link to another page of the app is held until the
 * pending save has run, and the same click is then let through. A save that
 * fails holds the link and asks: stay and fix it, or leave without the
 * unsaved changes.
 *
 * Navigation that is not a click on a link (a shortcut, the search palette,
 * a dialog that opens what it made) goes through `useGuardedPush`, which
 * clicks a link for it, so it is held the same way.
 */
export function useSaveBeforeLeaving(options: Options) {
  const latest = useRef(options)
  latest.current = options
  const releasedLink = useRef<HTMLAnchorElement | null>(null)
  const [blockedLeave, setBlockedLeave] = useState<BlockedLeave | null>(null)

  const stayOnPage = useCallback(() => setBlockedLeave(null), [])

  const leaveWithoutSaving = useCallback(() => {
    if (!blockedLeave) return
    latest.current.discard()
    setBlockedLeave(null)
    const { anchor } = blockedLeave
    if (!anchor.isConnected) {
      // A link inside a menu that has since closed: go by its address.
      window.location.assign(anchor.href)
      return
    }
    releasedLink.current = anchor
    anchor.click()
  }, [blockedLeave])

  const { active } = options
  useEffect(() => {
    if (!active) return
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element | null)?.closest?.('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return
      // The click this handler released after saving: let it through.
      if (releasedLink.current === anchor) {
        releasedLink.current = null
        return
      }
      if (anchor.target && anchor.target !== '_self') return
      if (anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.href)
      if (destination.origin !== window.location.origin) return
      const here = `${window.location.pathname}${window.location.search}`
      if (`${destination.pathname}${destination.search}` === here) return

      event.preventDefault()
      event.stopPropagation()
      const { leavingRef, lastErrorRef } = latest.current
      // One way out at a time: a second link clicked while the first waits
      // would start its own wait, and both would navigate once the save landed.
      if (leavingRef.current) return
      leavingRef.current = true
      lastErrorRef.current = null
      // An autosave already under way answers first; a second save would be
      // turned away while it runs and read as a refusal.
      const settled = new Promise<void>((resolve) => {
        const check = () => (latest.current.isSaving() ? setTimeout(check, 50) : resolve())
        check()
      })
      void settled
        .then(() => (latest.current.isDirty() ? latest.current.save() : undefined))
        .then(() => {
          leavingRef.current = false
          if (latest.current.isDirty()) {
            setBlockedLeave({ anchor, reason: lastErrorRef.current })
            return
          }
          releasedLink.current = anchor
          anchor.click()
        })
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [active])

  return { blockedLeave, stayOnPage, leaveWithoutSaving }
}
