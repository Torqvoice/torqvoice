'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

const MARK = 'data-guarded-link'

/**
 * `router.push` for navigation that does not start with a click on a link:
 * a keyboard shortcut, a row in the search palette, a dialog that opens what
 * it just made.
 *
 * It goes through a click on a real link rather than straight to the router.
 * An editor with unsaved changes holds link clicks back until its save has
 * run (`useSaveBeforeLeaving`), and a straight `router.push` would walk past
 * that and drop the edit. With nothing unsaved the click arrives at once and
 * this is `router.push`.
 */
export function useGuardedPush(): (href: string) => void {
  const router = useRouter()
  return useCallback(
    (href: string) => {
      // A link of its own for every attempt. A held attempt keeps its link
      // and its address until the save has answered; a second attempt made
      // meanwhile is turned away by the editor and must not change where the
      // first one is going.
      const link = document.createElement('a')
      link.hidden = true
      link.tabIndex = -1
      link.setAttribute('aria-hidden', 'true')
      link.setAttribute(MARK, '')
      link.setAttribute('href', href)
      link.addEventListener('click', (event) => {
        event.preventDefault()
        // Followed: this one and any attempt that was turned away are done.
        for (const stale of document.querySelectorAll(`a[${MARK}]`)) stale.remove()
        router.push(href)
      })
      document.body.appendChild(link)
      link.click()
    },
    [router]
  )
}
