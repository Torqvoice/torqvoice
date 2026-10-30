/**
 * The conversation on screen, as the links an inbound notification carries.
 *
 * A message arriving for the thread the reader is already looking at should
 * not ring the bell: the thread shows it, and the feed files it read. The
 * open thread registers the links a notification for it would carry (a
 * customer thread and an address thread are the same conversation, so an
 * email thread registers both); the socket handler asks before announcing.
 *
 * Module state rather than a store: only one conversation is open at a time
 * and nothing renders from it, so a subscription would be overhead.
 */

let active: ReadonlySet<string> = new Set()

export function setActiveConversation(urls: readonly string[] | null): void {
  active = new Set(urls ?? [])
}

export function isActiveConversation(url: string | null | undefined): boolean {
  return Boolean(url) && active.has(url as string)
}
