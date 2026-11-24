import { wasIssuedBeforeTracking } from '@/features/invoices/Lib/issuedInvoice'
import { addZonedDays, zonedDayKey } from '@/lib/timezone'

/**
 * What the work order's invoice date fields show, as YYYY-MM-DD on the
 * workshop's calendar, and whether each is left for the issue to fill.
 *
 * A draft is dated, and falls due by the payment terms, the day it is issued
 * (invoiceDateAtIssue, dueDateAtIssue). So a draft shows only the dates
 * somebody set: a date shown here would be saved with the form as if it had
 * been chosen, and the issue would then keep it. That holds for the due date
 * even when the invoice date was typed.
 *
 * An issued invoice shows the dates it went out with, the due date counted
 * from the terms when it has none stored. So does an invoice sent or paid
 * before issuing tracked it, with no issue stamp: it is no draft, and the
 * print reads it the same way (assembleInvoicePrint).
 */
export function invoiceDateFields(
  record: {
    issuedAt: Date | null
    sentAt: Date | null
    manuallyPaid: boolean
    payments?: { amount: number }[]
    invoiceDate: Date | null
    invoiceDueDate: Date | null
    startDateTime: Date | null
    serviceDate: Date
  },
  opts: { timeZone: string; dueDays: number }
): {
  invoiceDate: string
  invoiceDueDate: string
  invoiceDatedOnIssue: boolean
  invoiceDueDatedOnIssue: boolean
} {
  const { timeZone, dueDays } = opts
  // A timestamp outside JS date range (bad legacy data) must degrade to a
  // fallback date, not crash the page.
  const renderable = (d: Date | null | undefined): d is Date =>
    !!d && !Number.isNaN(new Date(d).getTime())
  const effective =
    [record.invoiceDate, record.startDateTime, record.serviceDate].find(renderable) ?? new Date()
  const isDraft = !record.issuedAt && !wasIssuedBeforeTracking(record)
  const datedOnIssue = isDraft && !renderable(record.invoiceDate)

  return {
    invoiceDate: datedOnIssue ? '' : zonedDayKey(effective, timeZone),
    invoiceDueDate: renderable(record.invoiceDueDate)
      ? zonedDayKey(record.invoiceDueDate, timeZone)
      : !isDraft && dueDays > 0
        ? zonedDayKey(addZonedDays(effective, dueDays, timeZone), timeZone)
        : '',
    invoiceDatedOnIssue: datedOnIssue,
    invoiceDueDatedOnIssue: isDraft,
  }
}
