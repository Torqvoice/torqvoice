/**
 * Whether a paid order belongs to the invoice a request says it does.
 *
 * A vendor confirming that an order was paid says nothing about which invoice
 * it was paid for. The record id and organisation were written into the order
 * when it was created (PayPal custom_id, Vipps metadata, Stripe metadata), so
 * the vendor hands them back with the verified order, and the payment is only
 * recorded when they name the same record the request named. Anything missing
 * counts as a mismatch: an order without attribution cannot be matched to an
 * invoice, so it must not be recorded against one.
 */

export interface PaymentAttribution {
  serviceRecordId?: string | null
  organizationId?: string | null
}

export interface ExpectedAttribution {
  serviceRecordId: string
  organizationId: string
}

export function paymentMatchesRecord(
  meta: PaymentAttribution,
  expected: ExpectedAttribution
): boolean {
  if (!meta.serviceRecordId || !meta.organizationId) return false
  if (!expected.serviceRecordId || !expected.organizationId) return false
  return (
    meta.serviceRecordId === expected.serviceRecordId &&
    meta.organizationId === expected.organizationId
  )
}
