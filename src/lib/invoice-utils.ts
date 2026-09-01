/**
 * Resolves template variables in an invoice prefix string.
 * Supported variables: {year} -> current 4-digit year
 */
export function resolveInvoicePrefix(prefix: string): string {
  return prefix.replace(/\{year\}/g, String(new Date().getFullYear()))
}

/**
 * Parse a client-supplied date string for persistence. Returns undefined when
 * missing, unparseable, or outside 1900-2100, so malformed input can never
 * reach the database (out-of-range timestamps break rendering later).
 */
export function toSafeDate(value: string | undefined | null): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (isNaN(d.getTime())) return undefined
  const year = d.getFullYear()
  return year >= 1900 && year <= 2100 ? d : undefined
}

/**
 * The date an invoice is presented with: an explicitly set invoice date
 * wins over the scheduled start, which wins over the service date.
 * Matches what the invoice PDF and share views print.
 */
export function effectiveInvoiceDate(record: {
  invoiceDate?: Date | string | null
  startDateTime?: Date | string | null
  serviceDate: Date | string
}): Date {
  return new Date(record.invoiceDate ?? record.startDateTime ?? record.serviceDate)
}
