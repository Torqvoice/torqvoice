import { db } from '@/lib/db'

export interface VendorPaymentInput {
  serviceRecordId: string
  /** Who reported it: stripe, paypal, vipps, or a ledger such as quickbooks. */
  provider: string
  /** The reporter's own id for the payment. */
  externalId: string
  amount: number
  /** One of the app's methods, which for a vendor is usually its own name. */
  method: string
  date?: Date
  note?: string | null
}

/**
 * Records a payment somebody else reported, exactly once.
 *
 * A customer's payment is reported more than once by design: their browser
 * comes back to the invoice and asks for it to be checked, the vendor sends a
 * notification, and the vendor retries that notification. They arrive in the
 * same second. Every path used to look for the payment and then write it, as
 * two steps, and two reports could both find nothing and both write a row.
 *
 * The table holds a unique key on (serviceRecordId, provider, externalId), and
 * the write skips a row that key already holds, in the same statement. So the
 * write is the check, and a report that loses the race is not an error: most
 * card payments are reported twice, and a conflict raised and caught for each
 * would put an error in the server log for most payments a workshop takes.
 * The report that loses gets back the row that won, marked as not created, and
 * a caller that tells somebody about a new payment does so only for the one
 * that was.
 */
export async function recordVendorPayment(
  input: VendorPaymentInput
): Promise<{ id: string; created: boolean }> {
  const [row] = await db.payment.createManyAndReturn({
    data: [
      {
        serviceRecordId: input.serviceRecordId,
        provider: input.provider,
        externalId: input.externalId,
        amount: input.amount,
        method: input.method,
        ...(input.date ? { date: input.date } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  })
  if (row) return { id: row.id, created: true }

  const existing = await db.payment.findFirst({
    where: {
      serviceRecordId: input.serviceRecordId,
      provider: input.provider,
      externalId: input.externalId,
    },
    select: { id: true },
  })
  // Skipped as a duplicate with no row holding it would mean a conflict on
  // something other than the payment key, which is not the race this handles.
  if (!existing) {
    throw new Error(
      `A ${input.provider} payment ${input.externalId} was not written and no row holds it`
    )
  }
  return { id: existing.id, created: false }
}
