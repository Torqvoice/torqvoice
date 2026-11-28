import type { BillingColumn } from '@/features/billing/Schema/billingListSchema'

/**
 * Columns that make way when the table is narrow, the first to go first.
 * The rest (invoice, title, date, total, balance) always show when chosen.
 */
const DROP_ORDER: BillingColumn[] = [
  'plate',
  'vehicle',
  'age',
  'paid',
  'delivery',
  'customer',
  'status',
]

/** Roughly the room (px) each column takes, matching the widths of its cells. */
const COLUMN_WIDTH: Record<BillingColumn, number> = {
  invoice: 104,
  title: 200,
  vehicle: 180,
  plate: 96,
  customer: 170,
  date: 100,
  age: 96,
  total: 120,
  delivery: 96,
  paid: 120,
  balance: 120,
  status: 96,
}

/**
 * Until the table is measured, the container classes stand in for the
 * measured choice, so the first paint already fits.
 */
export const BREAKPOINT_CLASS: Partial<Record<BillingColumn, string>> = {
  status: 'hidden @3xl:table-cell',
  customer: 'hidden @4xl:table-cell',
  age: 'hidden @5xl:table-cell',
  delivery: 'hidden @5xl:table-cell',
  paid: 'hidden @5xl:table-cell',
  vehicle: 'hidden @7xl:table-cell',
  plate: 'hidden @7xl:table-cell',
}

/**
 * The chosen columns that fit a table this wide. Columns make way in
 * DROP_ORDER until the rest fit, but the last one standing always shows, so
 * a short choice (only Vehicle, say) is never an empty table.
 */
export function fittingColumns(columns: BillingColumn[], width: number): Set<BillingColumn> {
  const visible = new Set(columns)
  const room = () => [...visible].reduce((sum, c) => sum + COLUMN_WIDTH[c], 0)
  for (const column of DROP_ORDER) {
    if (room() <= width || visible.size <= 1) break
    visible.delete(column)
  }
  return visible
}
