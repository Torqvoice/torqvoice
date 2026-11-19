/**
 * The customer's reference on a work order or a quote: a purchase order
 * number, a requisition, a name. Free text the customer chose, so nothing
 * about its shape is checked beyond its length.
 */
export const CUSTOMER_REFERENCE_MAX_LENGTH = 100

/** What is stored for what was typed: trimmed, and null when nothing is left. */
export function normalizeCustomerReference(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed.slice(0, CUSTOMER_REFERENCE_MAX_LENGTH) : null
}

/**
 * Whether a job is waiting for the customer's reference before it can be
 * invoiced: the workshop uses the field, this customer's invoices need one,
 * and none has been entered.
 */
export function referenceMissing(
  enabled: boolean,
  job: { customerReference?: string | null },
  customer: { poRequired?: boolean | null } | null | undefined
): boolean {
  return (
    enabled && Boolean(customer?.poRequired) && !normalizeCustomerReference(job.customerReference)
  )
}
