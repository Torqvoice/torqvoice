import type { Prisma } from '@/generated/prisma/client'
import { effectiveInvoiceDate } from '@/lib/invoice-utils'

/**
 * Which day a work order counts on in a report.
 *
 * Money follows the invoice (accrual): revenue and tax count on the invoice
 * date, the date the invoice is printed with. A job opened in September and
 * invoiced in November is November's revenue. Before a job is invoiced it has
 * no invoice date, so it counts on its start, and a legacy job with neither
 * on its service date.
 *
 * Workload follows the work: jobs, hours, parts and customers count on the
 * day the job started, or its service date when it has no start.
 *
 * The `...In` helpers are the same rules as Prisma filters. Each is an `OR`,
 * so a caller puts it inside `AND: [...]` and never spreads it at the top
 * level, where it would overwrite an `OR` of the caller's own.
 */

export interface DateRange {
  gte: Date
  lt: Date
}

type DocumentDated = {
  invoiceDate?: Date | string | null
  startDateTime?: Date | string | null
  serviceDate: Date | string
}

/** The day a job's money counts on: its invoice date, else its start, else its service date. */
export function documentDateOf(r: DocumentDated): Date {
  return effectiveInvoiceDate(r)
}

/** Jobs whose document date (see `documentDateOf`) falls in the range. */
export function documentDateIn(range: DateRange): Prisma.ServiceRecordWhereInput {
  return {
    OR: [
      { invoiceDate: range },
      { invoiceDate: null, startDateTime: range },
      { invoiceDate: null, startDateTime: null, serviceDate: range },
    ],
  }
}

/** The day a job's work counts on: its start, else its service date. */
export function workDateOf(r: { startDateTime?: Date | null; serviceDate: Date }): Date {
  return r.startDateTime ?? r.serviceDate
}

/** Jobs whose work date (see `workDateOf`) falls in the range. */
export function workDateIn(range: DateRange): Prisma.ServiceRecordWhereInput {
  return {
    OR: [{ startDateTime: range }, { startDateTime: null, serviceDate: range }],
  }
}

/**
 * Jobs marked paid by hand in the range: on the day they were marked, or,
 * for a job marked before that day was recorded, on its document date.
 */
export function manualPaidIn(range: DateRange): Prisma.ServiceRecordWhereInput {
  return {
    manuallyPaid: true,
    OR: [{ manuallyPaidAt: range }, { manuallyPaidAt: null, AND: [documentDateIn(range)] }],
  }
}
