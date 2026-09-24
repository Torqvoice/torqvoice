'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

const REPORT_SUMMARY = {
  id: true,
  title: true,
  message: true,
  status: true,
  videoUrl: true,
  createdAt: true,
  publicToken: true,
  expiresAt: true,
  customerFeedback: true,
  feedbackAt: true,
  sentVia: true,
  sentAt: true,
} as const

export async function getStatusReportsForService(serviceRecordId: string) {
  return withAuth(
    async ({ organizationId }) => {
      // A missing or foreign-org record yields an empty list rather than an
      // error: the reports query below is org-scoped anyway, and this action
      // runs during page renders of just-deleted records (see deleteServiceRecord
      // revalidating the current route).
      const serviceRecord = await db.serviceRecord.findFirst({
        where: { id: serviceRecordId, organizationId },
        select: { id: true },
      })
      if (!serviceRecord) return []

      const reports = await db.statusReport.findMany({
        where: { serviceRecordId, organizationId },
        select: REPORT_SUMMARY,
        orderBy: { createdAt: 'desc' },
      })

      return reports
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}

/** The reports sent from an inspection, newest first; the same shape as a job's. */
export async function getStatusReportsForInspection(inspectionId: string) {
  return withAuth(
    async ({ organizationId }) => {
      const inspection = await db.inspection.findFirst({
        where: { id: inspectionId, organizationId },
        select: { id: true },
      })
      if (!inspection) return []

      return db.statusReport.findMany({
        where: { inspectionId, organizationId },
        select: REPORT_SUMMARY,
        orderBy: { createdAt: 'desc' },
      })
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.INSPECTIONS },
      ],
    }
  )
}
