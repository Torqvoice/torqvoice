import { getLocale, getTranslations } from 'next-intl/server'
import type { BillingReportData } from '@/features/billing/Lib/billingReport.server'
import {
  monthName,
  type ReportFormatters,
  type Translate,
} from '@/features/billing/Lib/billingReportModel'
import { formatCurrency, formatDateTime, formatDayKey } from '@/lib/format'

/**
 * The words and formatters a report file is written with on the server: the
 * signed-in person's language (the report is for the workshop's own staff,
 * like the screen it came from), the workshop's clock, date format and
 * currency.
 */
export async function serverReportFormat(report: BillingReportData): Promise<{
  t: Translate
  f: ReportFormatters
  locale: string
}> {
  const locale = await getLocale()
  const translate = await getTranslations('billing.report')
  const t: Translate = (key, values) => translate(key as never, values as never)
  const f: ReportFormatters = {
    day: (key) => formatDayKey(key, report.dateFormat, locale),
    dateTime: (iso) =>
      formatDateTime(iso, report.dateFormat, report.timeFormat, report.timeZone, locale),
    money: (amount) => formatCurrency(amount, report.currencyCode, report.currencyFormat),
    month: (key) => monthName(key, locale),
  }
  return { t, f, locale }
}
