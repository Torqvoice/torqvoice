'use server'

import { z } from 'zod'
import { loadBillingReport } from '@/features/billing/Lib/billingReport.server'
import { billingReportInputSchema } from '@/features/billing/Schema/billingListSchema'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

/**
 * The billing list as a report, for printing: every invoice the page's
 * filters, date range and grouping keep (not just the rows scrolled into
 * view), the totals and group subtotals, and the letterhead.
 */
export async function getBillingReport(input: z.input<typeof billingReportInputSchema>) {
  return withAuth(
    async ({ organizationId }) => {
      const { columns, title, ...filters } = billingReportInputSchema.parse(input)
      return loadBillingReport(organizationId, filters, columns, title)
    },
    { requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.BILLING }] }
  )
}
