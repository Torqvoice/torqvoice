/**
 * Resolves template variables in an invoice prefix string.
 * Supported variables: {year} -> current 4-digit year
 */
export function resolveInvoicePrefix(prefix: string): string {
  return prefix.replace(/\{year\}/g, String(new Date().getFullYear()));
}

/**
 * The date an invoice is presented with: an explicitly set invoice date
 * wins over the scheduled start, which wins over the service date.
 * Matches what the invoice PDF and share views print.
 */
export function effectiveInvoiceDate(record: {
  invoiceDate?: Date | string | null;
  startDateTime?: Date | string | null;
  serviceDate: Date | string;
}): Date {
  return new Date(record.invoiceDate ?? record.startDateTime ?? record.serviceDate);
}
