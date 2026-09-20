'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { releaseFiles } from '@/lib/files/manager'

export async function deleteStatusReport(statusReportId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const report = await db.statusReport.findFirst({
        where: { id: statusReportId, organizationId },
        select: { id: true, videoUrl: true, organizationId: true },
      })

      if (!report) throw new Error('Status report not found')

      await db.statusReport.delete({ where: { id: report.id } })
      // Its video once the report is gone, from wherever uploads are kept.
      await releaseFiles([report.videoUrl], { organizationId, reason: 'status report deleted' })

      return { deleted: true, statusReportId }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.DELETE, subject: PermissionSubject.SERVICES },
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
