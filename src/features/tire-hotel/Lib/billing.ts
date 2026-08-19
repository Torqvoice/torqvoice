/**
 * Storage billing.
 *
 * Two shapes cover how tire hotels actually charge worldwide: a flat fee for
 * a season, and a smaller sum every month. Everything else workshops do —
 * annual rates, half-year rates, per-tire pricing — is one of those two with
 * a different number in it, so the model stays at two rather than growing a
 * case per market.
 */

export const STORAGE_BILLING_MODELS = ['seasonal', 'monthly'] as const
export type StorageBillingModel = (typeof STORAGE_BILLING_MODELS)[number]

export const STORAGE_AGREEMENT_STATUSES = ['active', 'ended', 'cancelled'] as const
export type StorageAgreementStatus = (typeof STORAGE_AGREEMENT_STATUSES)[number]

export const STORAGE_CHARGE_STATUSES = ['pending', 'invoiced', 'waived'] as const
export type StorageChargeStatus = (typeof STORAGE_CHARGE_STATUSES)[number]

/**
 * Where a storage charge lands. Asked at the moment of billing rather than
 * configured, because the right answer changes case by case: a customer
 * collecting during a service wants one bill, a customer who only stores
 * wants their own document, and a set on a vehicle may want a proper job
 * others can see on the board.
 */
export const CHARGE_TARGETS = ['new_invoice', 'new_work_order', 'existing'] as const
export type ChargeTarget = (typeof CHARGE_TARGETS)[number]

export const AGREEMENT_STATUS_TOKENS: Record<StorageAgreementStatus, string> = {
  active: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  ended: 'bg-muted text-muted-foreground border-border',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20',
}

export const CHARGE_STATUS_TOKENS: Record<StorageChargeStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  invoiced: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  waived: 'bg-muted text-muted-foreground border-border',
}

export type Extra = { label: string; price: number }

/**
 * Extras are stored as JSON, so anything could be in the column — a hand-run
 * SQL update, an older shape, a null. Parsing defensively keeps one bad row
 * from taking down the page that lists it.
 */
export function parseExtras(value: unknown): Extra[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const { label, price } = entry as Record<string, unknown>
    if (typeof label !== 'string' || !label.trim()) return []
    const amount = typeof price === 'number' ? price : Number(price)
    if (!Number.isFinite(amount)) return []
    return [{ label: label.trim(), price: amount }]
  })
}

export function extrasTotal(extras: Extra[]): number {
  return extras.reduce((sum, e) => sum + e.price, 0)
}

/** What one period costs: the base price plus whatever was added to it. */
export function periodAmount(price: number, extras: Extra[]): number {
  return round2(price + extrasTotal(extras))
}

/** Money is Float in this schema, so round at the boundaries to keep
 *  0.1 + 0.2 out of the invoice. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/**
 * The period a given date falls in.
 *
 * Seasonal periods run six months from the agreement's start day, which is
 * how a summer-to-winter cycle behaves without hard-coding a hemisphere or a
 * calendar month. Monthly periods run start-day to start-day.
 */
export function periodFor(
  billingModel: StorageBillingModel,
  startDate: Date,
  on: Date
): { periodStart: Date; periodEnd: Date } {
  const monthsPerPeriod = billingModel === 'seasonal' ? 6 : 1

  const elapsed = monthsBetween(startDate, on)
  const index = Math.max(0, Math.floor(elapsed / monthsPerPeriod))

  const periodStart = addMonths(startDate, index * monthsPerPeriod)
  const periodEnd = addMonths(startDate, (index + 1) * monthsPerPeriod)
  return { periodStart, periodEnd }
}

/** The period after the one given. */
export function nextPeriod(
  billingModel: StorageBillingModel,
  periodStart: Date
): { periodStart: Date; periodEnd: Date } {
  const months = billingModel === 'seasonal' ? 6 : 1
  return {
    periodStart: addMonths(periodStart, months),
    periodEnd: addMonths(periodStart, months * 2),
  }
}

/**
 * Adds months while keeping the day of month where it exists. A set checked
 * in on the 31st bills on the 30th in a 30-day month rather than rolling into
 * the next one, which would drift the whole schedule forward over a year.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const targetDay = result.getDate()
  result.setDate(1)
  result.setMonth(result.getMonth() + months)
  const lastDayOfTarget = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(targetDay, lastDayOfTarget))
  return result
}

/** Whole months from `from` to `to`, floored, never negative-rounded. */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  return months
}

/**
 * Periods that have started but carry no charge row yet, oldest first.
 *
 * Driven by what is already recorded rather than by a cursor on the
 * agreement, so a sweep that runs twice, or runs late after downtime, bills
 * each period exactly once.
 */
export function duePeriods(
  agreement: {
    billingModel: string
    startDate: Date
    endDate: Date | null
    status: string
  },
  existingPeriodStarts: Date[],
  now: Date,
  maxPeriods = 24
): { periodStart: Date; periodEnd: Date }[] {
  if (agreement.status !== 'active') return []
  if (agreement.startDate > now) return []

  const model: StorageBillingModel = agreement.billingModel === 'monthly' ? 'monthly' : 'seasonal'
  const billed = new Set(existingPeriodStarts.map((d) => d.getTime()))

  const due: { periodStart: Date; periodEnd: Date }[] = []
  let cursor = {
    periodStart: agreement.startDate,
    periodEnd: addMonths(agreement.startDate, model === 'seasonal' ? 6 : 1),
  }

  for (let i = 0; i < maxPeriods; i++) {
    if (cursor.periodStart > now) break
    if (agreement.endDate && cursor.periodStart >= agreement.endDate) break
    if (!billed.has(cursor.periodStart.getTime())) due.push({ ...cursor })
    cursor = nextPeriod(model, cursor.periodStart)
  }

  return due
}
