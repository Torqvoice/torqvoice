'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { releaseFiles } from '@/lib/files/manager'

/**
 * A report sent from a job is deleted by whoever may delete jobs; one sent
 * from an inspection by whoever may delete inspections. Which it is can only
 * be read from the row, so the row is found first, under the session alone,
 * and the delete then runs under the right permission.
 */
export async function deleteStatusReport(statusReportId: string) {
  const found = await withAuth(async ({ organizationId }) =>
    db.statusReport.findFirst({
      where: { id: statusReportId, organizationId },
      select: { id: true, videoUrl: true, organizationId: true, inspectionId: true },
    })
  )
  if (!found.success) return found
  const report = found.data
  if (!report) return { success: false as const, error: 'Status report not found' }

  return withAuth(
    async ({ organizationId }) => {
      if (report.organizationId !== organizationId) throw new Error('Status report not found')
      await db.statusReport.delete({ where: { id: report.id } })
      // Its video once the report is gone, from wherever uploads are kept.
      await releaseFiles([report.videoUrl], { organizationId, reason: 'status report deleted' })

      return { deleted: true, statusReportId }
    },
    {
      requiredPermissions: [
        report.inspectionId
          ? { action: PermissionAction.DELETE, subject: PermissionSubject.INSPECTIONS }
          : { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'statusReport.delete',
        entity: 'StatusReport',
        entityId: result.statusReportId,
        details: { key: 'statusReport_delete' },
      }),
    }
  )
}
