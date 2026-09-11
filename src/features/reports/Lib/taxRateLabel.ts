import type { TaxByRate } from '../Schema/reportTypes'

/** "GST (5%)" for a split tax's component, "25%" for a plain rate. */
export function taxRateLabel(row: Pick<TaxByRate, 'taxRate' | 'name'>): string {
  return row.name ? `${row.name} (${row.taxRate}%)` : `${row.taxRate}%`
}
