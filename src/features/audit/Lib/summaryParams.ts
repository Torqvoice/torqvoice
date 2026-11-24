/**
 * The values an audit sentence is written with, made ready for the reader.
 *
 * A row keeps what it was given when it was written, so this is where a
 * value becomes what a person reads: an integration named by id gets the
 * reader's name for it, an amount stored with its currency reads as money
 * the way the workshop prints it ("£100.00", not "100"), and a payment
 * logged before it named the job by invoice number or title still shows the
 * job's id.
 */
export function auditSummaryParams(
  stored: Record<string, string | number> | undefined,
  read: {
    /** The reader's name for a connector, or null when there is none. */
    connectorName: (connectorId: string) => string | null
    formatCurrency: (amount: number, currencyCode: string) => string
  }
): Record<string, string | number> {
  const params = { ...stored }
  const { connectorId, amount, currency } = params
  if (typeof connectorId === 'string') {
    const name = read.connectorName(connectorId)
    if (name) params.name = name
  }
  if (typeof amount === 'number' && typeof currency === 'string') {
    params.amount = read.formatCurrency(amount, currency)
  }
  if (params.ref === undefined && params.serviceRecordId !== undefined) {
    params.ref = params.serviceRecordId
  }
  return params
}
