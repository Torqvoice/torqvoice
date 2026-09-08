/**
 * What a typed link address becomes before it is checked or sent.
 *
 * People type "example.com/book" and mean "https://example.com/book". A mail
 * client will not guess, and the renderer refuses anything that is not
 * http(s) or mailto, so the guess is made here, once, for the editor and the
 * renderers alike. A tag such as {share_link} is left for filling; an
 * address that already names a scheme is left alone.
 */

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i
const LOOKS_LIKE_HOST = /^(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#].*)?$/i
const LOOKS_LIKE_EMAIL = /^[^\s@/]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i

export function normalizeHref(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes('{') || HAS_SCHEME.test(trimmed)) return trimmed
  if (LOOKS_LIKE_EMAIL.test(trimmed)) return `mailto:${trimmed}`
  if (LOOKS_LIKE_HOST.test(trimmed)) return `https://${trimmed}`
  return trimmed
}

/** A link a mail client will follow, or null. Only http(s) and mailto pass. */
export function safeHref(value: string): string | null {
  const href = normalizeHref(value)
  return /^(https?:|mailto:)/i.test(href) ? href : null
}
