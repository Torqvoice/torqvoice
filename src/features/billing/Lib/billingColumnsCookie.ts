import type { BillingColumn } from '@/features/billing/Schema/billingListSchema'

/**
 * The billing columns this browser chose, in a cookie so the page renders
 * them on the server the first time, the same as the remembered sort and the
 * completed-only switch.
 */
export const BILLING_COLUMNS_COOKIE = 'billingColumns'

/** A year, the same as the other remembered list choices. */
const MAX_AGE = 60 * 60 * 24 * 365

export function rememberBillingColumns(columns: BillingColumn[]): void {
  if (typeof document === 'undefined') return
  document.cookie = `${BILLING_COLUMNS_COOKIE}=${encodeURIComponent(columns.join(','))}; path=/; max-age=${MAX_AGE}; samesite=lax`
}
