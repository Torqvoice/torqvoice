import { assertNotRestoring } from '@/lib/backup/freeze'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'

export type QuoteAnswer = 'accepted' | 'changes_requested'

/** What recording an answer needs of the quote; each caller finds it its own way. */
export interface AnswerableQuote {
  id: string
  organizationId: string | null
  quoteNumber: string | null
  title: string
  customer: { name: string } | null
}

/**
 * A customer's answer to a quote, written down and passed on to the workshop.
 * The one place this happens: the shared link finds the quote by its token,
 * the customer portal by the signed-in customer, and both end here, so an
 * answer means the same thing whichever door it came through.
 *
 * The caller has already decided this customer may answer this quote. Not a
 * server action, and never exported from a 'use server' file: it trusts the
 * quote it is handed.
 */
export async function recordQuoteResponse(
  quote: AnswerableQuote,
  answer: QuoteAnswer,
  message?: string | null
): Promise<void> {
  // Neither caller goes through withAuth, so the restore freeze is checked here.
  if (quote.organizationId) assertNotRestoring(quote.organizationId)

  await db.quote.update({
    where: { id: quote.id },
    data: {
      status: answer,
      customerMessage: message || null,
      // A new answer is news again, even on a quote whose last one was dismissed.
      responseDismissedAt: null,
    },
  })

  if (quote.organizationId) {
    const customerName = quote.customer?.name || 'A customer'
    const actionLabel = answer === 'accepted' ? 'accepted' : 'requested changes on'
    notify({
      organizationId: quote.organizationId,
      type: 'quote_response',
      title: `Quote ${answer === 'accepted' ? 'Accepted' : 'Changes Requested'}`,
      message: `${customerName} ${actionLabel} quote ${quote.quoteNumber || quote.title}`,
      entityType: 'quote',
      entityId: quote.id,
      entityUrl: `/quotes/${quote.id}`,
    })
  }
}
