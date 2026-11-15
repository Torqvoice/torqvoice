'use client'

import { type RefObject, useEffect, useState } from 'react'

/**
 * Whether the chat is really in front of the customer: its box is drawn and
 * on screen, and the browser tab is the one being looked at.
 *
 * The home keeps the chat mounted inside a box that is `display: none` on a
 * phone, and a tab can sit in the background for hours. In both cases the
 * chat must not poll, and above all must not mark the workshop's messages
 * read: nobody has seen them.
 *
 * Starts as "not visible" and waits for the browser to say otherwise, so a
 * hidden chat never gets even one request in. Where the browser cannot tell
 * (no IntersectionObserver), a drawn chat counts as visible.
 */
export function useChatVisible(ref: RefObject<HTMLElement | null>): boolean {
  const [onScreen, setOnScreen] = useState(false)
  const [tabInFront, setTabInFront] = useState(true)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') {
      setOnScreen(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry) setOnScreen(entry.isIntersecting)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  useEffect(() => {
    const read = () => setTabInFront(document.visibilityState !== 'hidden')
    read()
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [])

  return onScreen && tabInFront
}
