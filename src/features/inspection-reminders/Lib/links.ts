import { randomBytes } from 'node:crypto'
import { MIN_LINK_VALID_DAYS } from './settings'

const DAY_MS = 86_400_000
/** How long after the deadline a link still books, so a late click converts. */
export const GRACE_DAYS_AFTER_DUE = 7

export function newBookingToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * A link stays open at least the configured days from sending, and never
 * closes before the deadline plus a week of grace. A reminder sent three
 * months early therefore lasts past the deadline; one sent two days before
 * it still gives the customer a full week.
 */
export function linkExpiry(sentAt: Date, dueAt: Date, validDays: number): Date {
  const days = Math.max(MIN_LINK_VALID_DAYS, validDays)
  const fromSend = sentAt.getTime() + days * DAY_MS
  const fromDue = dueAt.getTime() + GRACE_DAYS_AFTER_DUE * DAY_MS
  return new Date(Math.max(fromSend, fromDue))
}

export function bookingUrl(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/b/${token}`
}
