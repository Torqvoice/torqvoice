'use client'

import type { Broadcast } from '@/lib/broadcast'

/**
 * The current notice, once a live update has replaced what the page loaded
 * with.
 *
 * Module scope rather than context, for the same reason the install prompt
 * uses it: the listener and the banner sit in different layouts, and the value
 * has to outlive any single subtree. `undefined` means nothing has arrived yet
 * and the server's value still stands, which is a different thing from `null`,
 * meaning a notice was explicitly cleared.
 */
let live: Broadcast | null | undefined
const subscribers = new Set<() => void>()

export function subscribe(onChange: () => void) {
  subscribers.add(onChange)
  return () => subscribers.delete(onChange)
}

export function getLiveBroadcast() {
  return live
}

export function setLiveBroadcast(next: Broadcast | null) {
  live = next
  for (const notify of subscribers) notify()
}

/**
 * Forgets the live value so the server's stands again.
 *
 * Distinct from setting it to null, which asserts that the notice was cleared.
 * "I no longer know" and "there is none" are different claims, and only the
 * second should blank a banner the page was rendered with.
 */
export function clearLiveBroadcast() {
  live = undefined
  for (const notify of subscribers) notify()
}
