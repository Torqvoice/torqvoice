import { gateFleetNumber, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import { jobMeterViews } from '@/features/meters/Lib/meters.server'
import { jobReadingDate } from '@/features/vehicles/Lib/vehicleReading'
import {
  gateCustomerReference,
  isCustomerReferenceEnabled,
} from '@/features/customer-reference/Lib/referenceSetting'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { apiError, apiOk, withApiAuth } from '@/lib/with-api-auth'
import { getOpenEntry } from '@/features/time-tracking/Lib/timeEntries'
import { gateTypeKey, isTypeKeyEnabled } from '@/features/vehicles/Lib/typeKeySetting'
import { jobScopeFor } from '@/features/workboard/Lib/jobTeam'

/**
 * One job, with everything the technician needs while standing at the car.
 *
 * Scoped to the organization, and then to the technician's own rows unless
 * they are an admin. A technician who guesses another job's id gets a 404
 * rather than a 403: whether a job exists in someone else's bay is not
 * information this endpoint should confirm.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiAuth(
    request,
    async (ctx) => {
      const { id } = await params

      const job = await db.serviceRecord.findFirst({
        where: {
          id,
          organizationId: ctx.organizationId,
          ...jobScopeFor(ctx),
        },
        select: {
          id: true,
          title: true,
          description: true,
          // Read only in the app: the value of these is that they are the
          // customer's account, not the shop's. Ordered the way the customer
          // raised them, with whatever the shop has found against each one.
          concerns: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              description: true,
              findings: {
                select: {
                  id: true,
                  description: true,
                  severity: true,
                  status: true,
                  faultCode: true,
                  faultStatus: true,
                  faultModule: true,
                  faultMeaning: true,
                },
              },
            },
          },
          status: true,
          diagnosticNotes: true,
          // The customer's reference / PO, for a workshop that uses the field.
          customerReference: true,
          mileage: true,
          startDateTime: true,
          endDateTime: true,
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              licensePlate: true,
              vin: true,
              // Read out at the parts counter in Germany, where it names the exact type.
              hsn: true,
              tsn: true,
              // The workshop's own number for the vehicle, for one that uses it.
              fleetNumber: true,
              mileage: true,
              customer: { select: { id: true, name: true, phone: true, email: true } },
            },
          },
          customer: { select: { id: true, name: true, phone: true, email: true } },
          partItems: {
            select: {
              id: true,
              name: true,
              quantity: true,
              unit: true,
              category: true,
              partNumber: true,
            },
            orderBy: { id: 'asc' },
          },
          laborItems: {
            select: { id: true, description: true, hours: true },
            orderBy: { id: 'asc' },
          },
          attachments: {
            select: {
              id: true,
              category: true,
              fileUrl: true,
              fileName: true,
              fileType: true,
              description: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
          },
          timeEntries: {
            select: { id: true, startedAt: true, endedAt: true, durationMinutes: true, note: true },
            orderBy: { startedAt: 'desc' },
            take: 20,
          },
        },
      })

      if (!job) return apiError(404, 'not_found', 'That job is not on your list.')

      const openEntry = await getOpenEntry(ctx.organizationId, ctx.technicianIds)
      const totalMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)

      const typeKeyOn = await isTypeKeyEnabled(ctx.organizationId)

      const referenceOn = await isCustomerReferenceEnabled(ctx.organizationId)
      const fleetNumberOn = await isFleetNumberEnabled(ctx.organizationId)
      // The vehicle's other meters with this job's readings; empty while the
      // workshop has none. Written through /jobs/:id/meters.
      const jobDate = await db.serviceRecord.findFirst({
        where: { id: job.id, organizationId: ctx.organizationId },
        select: { startDateTime: true, serviceDate: true },
      })
      const meters =
        job.vehicle && jobDate
          ? await jobMeterViews(ctx.organizationId, {
              id: job.id,
              vehicleId: job.vehicle.id,
              readAt: jobReadingDate(jobDate),
            })
          : []

      return apiOk({
        ...gateCustomerReference(job, referenceOn),
        vehicle: job.vehicle && gateFleetNumber(gateTypeKey(job.vehicle, typeKeyOn), fleetNumberOn),
        customer: job.customer ?? job.vehicle?.customer ?? null,
        isRunning: openEntry?.serviceRecordId === job.id,
        runningSince: openEntry?.serviceRecordId === job.id ? openEntry.startedAt : null,
        totalMinutes,
        meters,
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
