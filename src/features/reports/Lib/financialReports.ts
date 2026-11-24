import { db } from '@/lib/db'
import { earnedLineTotal, taxedNetAmountOf } from '@/lib/tax'
import { workshopMonthKey } from '@/lib/workshop-datetime'
import { type DateRange, documentDateIn, documentDateOf, manualPaidIn } from './reportDates'
import { TaxByRateTable } from './taxByRate'

/**
 * The revenue and tax reports, shared by the reports screen and the
 * scheduled report emails so the two cannot count differently.
 *
 * Revenue and tax count each invoice on its invoice date (see
 * `documentDateOf`). Collected counts each payment on the day it was
 * received, whichever month the invoice is in, and a job marked paid by
 * hand on the day it was marked.
 */

export interface FinancialReportOptions {
  /** Only work orders marked completed; open ones are left out. */
  completedOnly?: boolean
}

function statusScope(options: FinancialReportOptions) {
  return options.completedOnly ? { status: 'completed' } : {}
}

const chargedTotal = (r: { totalAmount: number; cost: number }) =>
  r.totalAmount > 0 ? r.totalAmount : r.cost

const sumPayments = (payments: { amount: number }[]) => payments.reduce((s, p) => s + p.amount, 0)

/** Oldest invoice first, so the by-type and by-rate rows keep a steady order. */
const byDocumentDate = <T extends Parameters<typeof documentDateOf>[0]>(records: T[]) =>
  records
    .map((r) => ({ r, at: documentDateOf(r).getTime() }))
    .sort((a, b) => a.at - b.at)
    .map(({ r }) => r)

interface RevenueMonth {
  revenue: number
  collected: number
  count: number
  partsCost: number
  partsRevenue: number
  laborRevenue: number
}

export async function computeRevenue(
  organizationId: string,
  range: DateRange,
  timeZone: string,
  options: FinancialReportOptions = {}
) {
  const scope = statusScope(options)
  const [records, payments, manuallyPaid] = await Promise.all([
    // Invoices dated in the window: what was charged.
    db.serviceRecord.findMany({
      where: { organizationId, ...scope, AND: [documentDateIn(range)] },
      select: {
        serviceDate: true,
        startDateTime: true,
        invoiceDate: true,
        totalAmount: true,
        cost: true,
        type: true,
        taxRate: true,
        taxInclusive: true,
        subtotal: true,
        discountAmount: true,
        manuallyPaid: true,
        payments: { select: { amount: true } },
        partItems: { select: { unitCost: true, quantity: true, total: true, taxable: true } },
        laborItems: { select: { total: true, taxable: true } },
      },
    }),
    // Payments received in the window, whichever invoice they pay. A refund
    // a ledger reported is a negative amount and comes off.
    db.payment.findMany({
      where: { date: range, serviceRecord: { organizationId, ...scope } },
      select: { amount: true, date: true },
    }),
    // Jobs marked paid by hand in the window: the part no payment covers.
    db.serviceRecord.findMany({
      where: { organizationId, ...scope, AND: [manualPaidIn(range)] },
      select: {
        serviceDate: true,
        startDateTime: true,
        invoiceDate: true,
        manuallyPaid: true,
        manuallyPaidAt: true,
        totalAmount: true,
        cost: true,
        payments: { select: { amount: true, date: true } },
      },
    }),
  ])

  // `revenue` is the gross customer-facing total (what was charged).
  // `partsRevenue` and `laborRevenue` are NET (pre-tax) and carry their
  // share of the job's discount, so they add up consistently with
  // `partsCost` (which is always net) for profit math.
  const monthly: Record<string, RevenueMonth> = {}
  const month = (date: Date) => {
    const key = workshopMonthKey(date, timeZone)
    if (!monthly[key])
      monthly[key] = {
        revenue: 0,
        collected: 0,
        count: 0,
        partsCost: 0,
        partsRevenue: 0,
        laborRevenue: 0,
      }
    return monthly[key]
  }

  let totalRevenue = 0
  let totalCollected = 0
  let outstanding = 0
  let totalCount = 0
  let totalPartsCost = 0
  let totalPartsRevenue = 0
  let totalLaborRevenue = 0
  const byType: Record<string, { revenue: number; count: number }> = {}

  for (const r of byDocumentDate(records)) {
    const total = chargedTotal(r)
    const partsCost = r.partItems.reduce((s, p) => s + p.unitCost * p.quantity, 0)
    const partsRevenue = r.partItems.reduce((s, p) => s + earnedLineTotal(p.total, r, p.taxable), 0)
    const laborRevenue = r.laborItems.reduce(
      (s, l) => s + earnedLineTotal(l.total, r, l.taxable),
      0
    )

    const m = month(documentDateOf(r))
    m.revenue += total
    m.count += 1
    m.partsCost += partsCost
    m.partsRevenue += partsRevenue
    m.laborRevenue += laborRevenue

    totalRevenue += total
    totalCount += 1
    totalPartsCost += partsCost
    totalPartsRevenue += partsRevenue
    totalLaborRevenue += laborRevenue
    // Still owed on this invoice today, whenever it was paid.
    if (!r.manuallyPaid) outstanding += Math.max(0, total - sumPayments(r.payments))

    if (!byType[r.type]) byType[r.type] = { revenue: 0, count: 0 }
    byType[r.type].revenue += total
    byType[r.type].count += 1
  }

  for (const p of payments) {
    month(p.date).collected += p.amount
    totalCollected += p.amount
  }

  for (const r of manuallyPaid) {
    if (!r.manuallyPaid) continue
    // What the payments had covered when it was marked. A payment or refund
    // after that counts in its own month, so a closed month never changes.
    // Marked before that day was recorded: every payment, as there is no cut-off.
    const markedAt = r.manuallyPaidAt
    const coveredBefore = markedAt ? r.payments.filter((p) => p.date <= markedAt) : r.payments
    const remainder = Math.max(0, chargedTotal(r) - sumPayments(coveredBefore))
    if (remainder === 0) continue
    month(r.manuallyPaidAt ?? documentDateOf(r)).collected += remainder
    totalCollected += remainder
  }

  return {
    monthly: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({
        month: key,
        ...data,
        partsNetProfit: data.partsRevenue - data.partsCost,
        netProfit: data.partsRevenue - data.partsCost + data.laborRevenue,
      })),
    byType: Object.entries(byType).map(([type, data]) => ({ type, ...data })),
    summary: {
      totalRevenue,
      totalCollected,
      outstanding,
      totalCount,
      totalPartsCost,
      totalPartsRevenue,
      totalPartsNetProfit: totalPartsRevenue - totalPartsCost,
      totalLaborRevenue,
      netProfit: totalPartsRevenue - totalPartsCost + totalLaborRevenue,
    },
  }
}

export async function computeTax(
  organizationId: string,
  range: DateRange,
  timeZone: string,
  options: FinancialReportOptions = {}
) {
  const records = await db.serviceRecord.findMany({
    where: { organizationId, ...statusScope(options), AND: [documentDateIn(range)] },
    select: {
      serviceDate: true,
      startDateTime: true,
      invoiceDate: true,
      subtotal: true,
      taxableSubtotal: true,
      taxRate: true,
      taxAmount: true,
      taxInclusive: true,
      taxComponents: true,
      totalAmount: true,
    },
  })

  const monthly: Record<
    string,
    { taxCollected: number; invoiceCount: number; taxableAmount: number }
  > = {}
  const byRate = new TaxByRateTable()
  let totalTaxCollected = 0
  let totalTaxableAmount = 0
  let totalInvoices = 0

  for (const r of byDocumentDate(records)) {
    if (r.taxAmount <= 0) continue

    const month = workshopMonthKey(documentDateOf(r), timeZone)

    // The taxable base = total - tax. This is the net amount on which tax
    // was calculated, and it works in BOTH inclusive and exclusive modes
    // (and accounts for any discount applied).
    const taxableBase = taxedNetAmountOf(r)

    if (!monthly[month]) monthly[month] = { taxCollected: 0, invoiceCount: 0, taxableAmount: 0 }
    monthly[month].taxCollected += r.taxAmount
    monthly[month].invoiceCount += 1
    monthly[month].taxableAmount += taxableBase

    byRate.add(r)

    totalTaxCollected += r.taxAmount
    totalTaxableAmount += taxableBase
    totalInvoices += 1
  }

  return {
    monthly: Object.entries(monthly)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data })),
    byRate: byRate.list(),
    summary: { totalTaxCollected, totalTaxableAmount, totalInvoices },
  }
}
