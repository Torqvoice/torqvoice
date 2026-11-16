'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

let link: HTMLAnchorElement | null = null
let follow: (href: string) => void = () => undefined

function guardedLink(): HTMLAnchorElement {
  if (link?.isConnected) return link
  link = document.createElement('a')
  link.hidden = true
  link.tabIndex = -1
  link.setAttribute('aria-hidden', 'true')
  link.dataset.guardedLink = ''
  link.addEventListener('click', (event) => {
    event.preventDefault()
    const href = link?.getAttribute('href')
    if (href) follow(href)
  })
  document.body.appendChild(link)
  return link
}

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
      const anchor = guardedLink()
      follow = (target) => router.push(target)
      anchor.setAttribute('href', href)
      anchor.click()
    },
    [router]
  )
}
