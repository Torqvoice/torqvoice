'use server'

import { z } from 'zod'
import { type PortalResult, withPortalAuth } from '@/features/portal/Lib/portalAuth'
import { SENT_TO_CUSTOMER, quoteAwaitsAnswer } from '@/features/portal/Lib/quoteVisibility'
import { type QuoteAnswer, recordQuoteResponse } from '@/features/quotes/Lib/recordQuoteResponse'
import { db } from '@/lib/db'
import { workshopTimeZone } from '@/lib/workshop-timezone'

const schema = z.object({
  quoteId: z.string().min(1),
  answer: z.enum(['accepted', 'changes_requested']),
  message: z.string().trim().max(2000).optional(),
})

/**
 * The signed-in customer answers a quote: accepts it, or asks for changes.
 *
 * The quote is found by who is signed in, never by a share link's token: it
 * must be this customer's, in this workshop, one that reached them, still
 * "sent" and not past its last valid day on the workshop's calendar. What
 * happens next is the same as on the shared quote page, through the same
 * function.
 *
 * No rate limit of its own: the shared page's endpoint has none either, and
 * here a caller needs a customer session, can only reach their own quotes,
 * and a quote leaves "sent" with its first answer, so a second call is refused.
 */
export async function respondToPortalQuote(
  input: unknown
): Promise<PortalResult<{ status: QuoteAnswer }>> {
  return withPortalAuth(async ({ customerId, organizationId }) => {
    const data = schema.parse(input)
    if (data.answer === 'changes_requested' && !data.message) {
      throw new Error('Say what you would like changed')
    }

    const quote = await db.quote.findFirst({
      where: { id: data.quoteId, customerId, organizationId, ...SENT_TO_CUSTOMER },
      select: {
        id: true,
        organizationId: true,
        quoteNumber: true,
        title: true,
        status: true,
        validUntil: true,
        customer: { select: { name: true } },
      },
    })
    if (!quote) throw new Error('Quote not found')
    if (!quoteAwaitsAnswer(quote, await workshopTimeZone(organizationId))) {
      throw new Error('This quote can no longer be answered')
    }

    await recordQuoteResponse(quote, data.answer, data.message)
    return { status: data.answer }
  })
}
