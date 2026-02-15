/**
 * Resolves template variables in an invoice prefix string.
 * Supported variables: {year} -> current 4-digit year
 */
export function resolveInvoicePrefix(prefix: string): string {
  return prefix.replace(/\{year\}/g, String(new Date().getFullYear()));
}
