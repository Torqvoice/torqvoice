'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/** Fired by the search palette with the anchor it just navigated to. */
export const SPOTLIGHT_EVENT = 'torqvoice:settings-spotlight'

export function requestSpotlight(anchor: string) {
  document.dispatchEvent(new CustomEvent(SPOTLIGHT_EVENT, { detail: anchor }))
}

const FOCUSABLE = 'input, textarea, select, button, [role="switch"], [role="combobox"], [tabindex]'

/**
 * Brings the element with this id into view and lights it up for a moment.
 * The settings pages render after their data arrives, so the lookup retries
 * for a couple of seconds before giving up quietly.
 */
function spotlight(anchor: string, attempt = 0) {
  const el = document.getElementById(anchor)
  if (!el) {
    if (attempt < 50) window.setTimeout(() => spotlight(anchor, attempt + 1), 50)
    return
  }
  const isCard = el.matches('[data-slot="card"]')
  el.scrollIntoView({ block: isCard ? 'start' : 'center', behavior: 'smooth' })
  el.classList.remove('settings-spotlight')
  // Restart the animation even when the same anchor is asked for twice.
  void el.offsetWidth
  el.classList.add('settings-spotlight')
  window.setTimeout(() => el.classList.remove('settings-spotlight'), 2600)
  if (el.matches(FOCUSABLE) && !el.matches('[disabled]')) {
    window.setTimeout(() => (el as HTMLElement).focus({ preventScroll: true }), 350)
  }
}

/**
 * Mounted once in the settings layout. Watches the URL hash, so a deep link
 * from the palette (or a bookmark) lands on the card or the field rather than
 * at the top of the page, and listens for the palette's own event for the
 * case where only the hash changes and no navigation happens.
 */
export function SettingsSpotlight() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const fromHash = () => {
      const anchor = window.location.hash.slice(1)
      if (anchor) spotlight(decodeURIComponent(anchor))
    }
    const fromEvent = (e: Event) => {
      const anchor = (e as CustomEvent<string>).detail
      if (anchor) spotlight(anchor)
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    document.addEventListener(SPOTLIGHT_EVENT, fromEvent)
    return () => {
      window.removeEventListener('hashchange', fromHash)
      document.removeEventListener(SPOTLIGHT_EVENT, fromEvent)
    }
  }, [pathname, searchParams])

  return null
}
