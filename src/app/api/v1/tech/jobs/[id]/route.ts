import { gateFleetNumber, isFleetNumberEnabled } from '@/features/vehicles/Lib/fleetNumberSetting'
import { appJobMeters } from '@/features/meters/Lib/appJobMeters.server'
import { appJobEquipment } from '@/features/equipment/Lib/jobWorkOn.server'
import {
  gateCustomerReference,
  isCustomerReferenceEnabled,
} from '@/features/customer-reference/Lib/referenceSetting'
import { db } from '@/lib/db'
import { getInvoiceLockState } from '@/lib/document-lock.server'
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
 *
 * Besides the job's own fields it carries:
 * - `documentLock: { locked, reason }`: whether the job's invoice is locked
 *   against edits, and why ('sent', 'paid' or 'accepted'; null when not
 *   locked), so the app can disable inputs before Save, as the web does. An
 *   edit sent anyway answers 409 `document_locked` with `details.reason`.
 * - `meters`: as `GET /jobs/:id/meters` answers them, `askAbove` included.
 * - `equipment`: as `GET /jobs/:id/equipment` answers it.
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
          // What a meter reading on the job is dated by; not sent itself.
          serviceDate: true,
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
      const { serviceDate, ...shown } = job

      const openEntry = await getOpenEntry(ctx.organizationId, ctx.technicianIds)
      const totalMinutes = job.timeEntries.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0)

      const typeKeyOn = await isTypeKeyEnabled(ctx.organizationId)

      const referenceOn = await isCustomerReferenceEnabled(ctx.organizationId)
      const fleetNumberOn = await isFleetNumberEnabled(ctx.organizationId)
      // The vehicle's other meters with this job's readings; empty while the
      // workshop has none. Written through /jobs/:id/meters.
      const meters = await appJobMeters(ctx.organizationId, {
        id: job.id,
        vehicleId: job.vehicle?.id ?? null,
        dates: { startDateTime: job.startDateTime, serviceDate },
      })
      // The equipment on the vehicle and which of it the job works on; null
      // while the workshop records none. Set through /jobs/:id/equipment.
      const equipment = await appJobEquipment(ctx.organizationId, {
        id: job.id,
        vehicleId: job.vehicle?.id ?? null,
      })
      const lock = await getInvoiceLockState(job.id, ctx.organizationId)

      return apiOk({
        ...gateCustomerReference(shown, referenceOn),
        vehicle: job.vehicle && gateFleetNumber(gateTypeKey(job.vehicle, typeKeyOn), fleetNumberOn),
        customer: job.customer ?? job.vehicle?.customer ?? null,
        isRunning: openEntry?.serviceRecordId === job.id,
        runningSince: openEntry?.serviceRecordId === job.id ? openEntry.startedAt : null,
        totalMinutes,
        meters,
        equipment,
        documentLock: { locked: lock.locked, reason: lock.locked ? lock.reason : null },
      })
    },
    {
      requireTechnician: true,
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
