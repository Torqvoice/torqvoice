import { z } from 'zod'

export const BILLING_GROUPS = ['customer', 'month', 'status'] as const
export type BillingGroupBy = (typeof BILLING_GROUPS)[number]

export function billingGroupBy(value: string | undefined | null): BillingGroupBy | null {
  return BILLING_GROUPS.includes(value as BillingGroupBy) ? (value as BillingGroupBy) : null
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** A day key from the URL, or nothing when it is not one. */
export function billingDayKey(value: string | undefined | null): string | undefined {
  return value && DAY_KEY.test(value) ? value : undefined
}

/** The group a row falls in, matching billingGroupKeySql. */
export function billingRowGroupKey(
  row: { status: string; month: string | null; customer: { id: string } | null },
  groupBy: BillingGroupBy
): string {
  if (groupBy === 'customer') return row.customer?.id ?? ''
  if (groupBy === 'month') return row.month ?? ''
  return row.status
}

const dayKey = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()

/** What the billing list is filtered, sorted and grouped by: the page's URL, read back. */
export const billingListInputSchema = z.object({
  search: z.string().max(200).optional(),
  status: z.string().max(50).optional(),
  delivery: z.string().max(20).optional(),
  completedOnly: z.boolean().optional(),
  sortBy: z.string().max(50).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  /** First and last invoice day, YYYY-MM-DD on the workshop's calendar. */
  from: dayKey,
  to: dayKey,
  groupBy: z.string().max(20).optional(),
})

export type BillingListInput = z.infer<typeof billingListInputSchema>

/** The columns the list and its report can show, in the order they appear. */
export const BILLING_COLUMNS = [
  'invoice',
  'title',
  'vehicle',
  'plate',
  'customer',
  'date',
  'age',
  'total',
  'delivery',
  'paid',
  'balance',
  'status',
] as const

export type BillingColumn = (typeof BILLING_COLUMNS)[number]

/** What the list showed before columns could be chosen, so nobody's view changes. */
export const DEFAULT_BILLING_COLUMNS: BillingColumn[] = [
  'invoice',
  'title',
  'vehicle',
  'customer',
  'date',
  'total',
  'delivery',
  'paid',
  'balance',
  'status',
]

export const billingColumnsSchema = z
  .array(z.enum(BILLING_COLUMNS))
  .min(1)
  .max(BILLING_COLUMNS.length)

/**
 * Columns from a cookie or a request, kept in the list's own order. Nothing
 * usable (no cookie, an old value) means the default set.
 */
export function parseBillingColumns(raw: string | string[] | undefined | null): BillingColumn[] {
  const parts = Array.isArray(raw) ? raw : (raw ?? '').split(',')
  const picked = new Set(parts.map((p) => p.trim()))
  const columns = BILLING_COLUMNS.filter((c) => picked.has(c))
  return columns.length > 0 ? columns : DEFAULT_BILLING_COLUMNS
}

export const BILLING_REPORT_FORMATS = ['print', 'pdf', 'xlsx', 'csv'] as const
export type BillingReportFormat = (typeof BILLING_REPORT_FORMATS)[number]

export const billingReportInputSchema = billingListInputSchema.extend({
  columns: billingColumnsSchema,
  /** What the report is headed; empty means the default title. */
  title: z.string().trim().max(120).optional(),
})

export type BillingReportInput = z.input<typeof billingReportInputSchema>
