import type { Prisma } from '@/generated/prisma/client'
import { zonedDayKey } from '@/lib/timezone'

/**
 * A quote the customer may see: one that reached them, whatever became of it
 * since. A draft is the workshop's own working copy, with prices it may still
 * change, so it never shows. Status alone is not enough either: a draft can be
 * turned straight into a work order and become "converted" without ever being
 * sent. So a quote shows when a send or a share link was recorded, or when its
 * status is one only a sent quote reaches, which also covers quotes sent before
 * sends were recorded.
 */
export const SENT_TO_CUSTOMER = {
  status: { not: 'draft' },
  OR: [
    { sentAt: { not: null } },
    { sharedAt: { not: null } },
    { status: { in: ['sent', 'accepted', 'rejected', 'changes_requested'] } },
  ],
} satisfies Prisma.QuoteWhereInput

/** The one status a quote in the portal can be answered from. */
export const PORTAL_ANSWERABLE_FROM: readonly string[] = ['sent']

/**
 * Whether a quote in the portal still waits for the customer's answer: it was
 * sent, nobody has answered it, and its last valid day has not passed. That
 * day is the workshop's, whole: a quote valid until the 7th can be answered
 * all of the 7th there, whatever the date is on the server.
 */
export function quoteAwaitsAnswer(
  quote: { status: string; validUntil: Date | null },
  timeZone: string,
  now: Date = new Date()
): boolean {
  if (!PORTAL_ANSWERABLE_FROM.includes(quote.status)) return false
  if (!quote.validUntil) return true
  return zonedDayKey(quote.validUntil, timeZone) >= zonedDayKey(now, timeZone)
}
