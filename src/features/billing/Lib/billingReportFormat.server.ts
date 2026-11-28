import { getLocale, getTranslations } from 'next-intl/server'
import type { BillingReportData } from '@/features/billing/Lib/billingReport.server'
import {
  type ReportFormatters,
  reportFormatters,
  type Translate,
} from '@/features/billing/Lib/billingReportModel'

/**
 * The words and formatters a report file is written with on the server: the
 * signed-in person's language, and the workshop's clock, date format and
 * currency (see `reportFormatters`, which Print uses too).
 */
export async function serverReportFormat(report: BillingReportData): Promise<{
  t: Translate
  f: ReportFormatters
  locale: string
}> {
  const locale = await getLocale()
  const translate = await getTranslations('billing.report')
  const t: Translate = (key, values) => translate(key as never, values as never)
  return { t, f: reportFormatters(report, locale), locale }
}
