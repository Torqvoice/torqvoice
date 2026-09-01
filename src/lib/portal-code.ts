import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * The one-time code a customer signs into the portal with.
 *
 * Six digits, because it is read off a lock screen and typed with a thumb.
 * What makes six digits safe is not the number of them, it is that a code
 * dies after a handful of wrong guesses: limiting by address does nothing
 * about a hundred machines sharing the work between them.
 */

export const PORTAL_CODE_MAX_ATTEMPTS = 5

export function generatePortalCode(): string {
  // randomInt, not Math.random. This is a credential.
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * What goes in the database.
 *
 * A plain hash rather than a password hash: the input is already six random
 * digits and the row is worthless fifteen minutes later. It means reading the
 * table hands over nobody's session.
 */
export function hashPortalCode(code: string): string {
  return createHash('sha256').update(code.replace(/\D/g, '')).digest('hex')
}

/** Compares two hex digests without giving away where they diverge. */
export function portalCodeMatches(stored: string, supplied: string): boolean {
  const a = Buffer.from(stored, 'hex')
  const b = Buffer.from(hashPortalCode(supplied), 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
