'use server'

import { workshopTimeZone } from '@/lib/workshop-timezone'
import { endOfWorkshopDay } from '@/lib/workshop-datetime'
import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { createStatusReportSchema } from '../Schema/statusReportSchema'

/**
 * A status report is about a work order or an inspection: the video the
 * customer is sent of the car on the lift, or of what the test found. Which
 * one decides whose permission is needed, so that is read before anything
 * else; the schema is parsed again inside, where a bad input is answered
 * rather than thrown.
 */
export async function createStatusReport(input: unknown) {
  const peek = createStatusReportSchema.safeParse(input)
  const forInspection = peek.success && !!peek.data.inspectionId

  return withAuth(
    async ({ userId, organizationId }) => {
      const data = createStatusReportSchema.parse(input)

      let technicianOnRecord: string | null = null
      if (data.inspectionId) {
        const inspection = await db.inspection.findFirst({
          where: { id: data.inspectionId, organizationId },
          select: { id: true, technicianId: true },
        })
        if (!inspection) throw new Error('Inspection not found')
        technicianOnRecord = inspection.technicianId
      } else {
        const serviceRecord = await db.serviceRecord.findFirst({
          where: { id: data.serviceRecordId, organizationId },
          select: { id: true, technicianId: true },
        })
        if (!serviceRecord) throw new Error('Service record not found')
        technicianOnRecord = serviceRecord.technicianId
      }

      // Find technician linked to current user
      const technician = await db.technician.findFirst({
        where: { organizationId, userId, isActive: true },
        select: { id: true },
      })

      const report = await db.statusReport.create({
        data: {
          publicToken: randomBytes(32).toString('hex'),
          title: data.title,
          message: data.message,
          videoUrl: data.videoUrl,
          videoFileName: data.videoFileName,
          serviceRecordId: data.serviceRecordId ?? null,
          inspectionId: data.inspectionId ?? null,
          organizationId,
          technicianId: technician?.id || technicianOnRecord,
          status: data.videoUrl ? 'published' : 'draft',
          // A chosen day means the link lives through the whole of that day.
          expiresAt:
            endOfWorkshopDay(data.expiresAt, await workshopTimeZone(organizationId)) ??
            new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      })

      return report
    },
    {
      requiredPermissions: [
        forInspection
          ? { action: PermissionAction.UPDATE, subject: PermissionSubject.INSPECTIONS }
          : { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'statusReport.create',
        entity: 'StatusReport',
        entityId: result.id,
        details: {
          key: 'statusReport_create',
          params: { serviceRecordId: result.serviceRecordId ?? result.inspectionId ?? '' },
        },
      }),
    }
  )
}
