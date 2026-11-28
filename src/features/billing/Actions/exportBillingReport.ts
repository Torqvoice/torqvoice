'use server'

import { z } from 'zod'
import { loadBillingReport } from '@/features/billing/Lib/billingReport.server'
import {
  billingReportCsv,
  billingReportPdf,
  billingReportXlsx,
  type ReportFile,
} from '@/features/billing/Lib/billingReportFiles.server'
import { serverReportFormat } from '@/features/billing/Lib/billingReportFormat.server'
import { buildReportModel } from '@/features/billing/Lib/billingReportModel'
import { billingReportInputSchema } from '@/features/billing/Schema/billingListSchema'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const inputSchema = billingReportInputSchema.extend({
  format: z.enum(['pdf', 'xlsx', 'csv']),
})

const MIME = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
} as const

/**
 * The billing list as a file to download: a PDF to send or file, a workbook
 * for the accountant, or CSV for a bookkeeping import. Same rows, columns,
 * totals and grouping as the report printed from the page.
 */
export async function exportBillingReport(input: z.input<typeof inputSchema>) {
  return withAuth(
    async ({ organizationId }): Promise<ReportFile> => {
      const { format, columns, title, ...filters } = inputSchema.parse(input)
      const report = await loadBillingReport(organizationId, filters, columns, title)
      const { t, f } = await serverReportFormat(report)
      const model = buildReportModel(report, t, f)

      let bytes: Buffer
      if (format === 'pdf') {
        bytes = await billingReportPdf(model, t('pageOf', { page: '{page}', pages: '{pages}' }))
      } else if (format === 'xlsx') {
        bytes = await billingReportXlsx(model, report, model.title)
      } else {
        // A group column, unless it would only repeat the customer column.
        const repeats = report.groupBy === 'customer' && columns.includes('customer')
        const groupLabel = report.groupBy && !repeats ? t(`groupBy.${report.groupBy}`) : undefined
        bytes = Buffer.from(billingReportCsv(model, groupLabel), 'utf8')
      }
      return {
        fileName: `${model.fileName}.${format}`,
        mimeType: MIME[format],
        base64: bytes.toString('base64'),
      }
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] }
  )
}
