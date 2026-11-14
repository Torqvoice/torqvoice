'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { invoicePaymentStatus } from '@/lib/document-lock'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

export interface VehicleGlance {
  /** When the page was put together: what "days ago" is counted from. */
  now: string
  openJobs: number
  doneJobs: number
  /** The day of the last finished job, and the job, so the day can open it. */
  lastVisit: string | null
  lastVisitJobId: string | null
  /** The start of the nearest open job with a slot still to come, and the job. */
  nextBooking: string | null
  nextBookingJobId: string | null
  /** What is still owed on work the customer has been billed for. */
  unpaid: number
  /** Jobs by id that still have money owed on them, and whether any has come in. */
  owed: Record<string, 'unpaid' | 'partial'>
  /** The owner's other vehicles that are not archived. */
  otherVehicles: number
}

/**
 * The figures somebody on the phone with the customer is asked for, worked
 * out over all of the vehicle's work orders rather than the ones a search
 * has left on the page: when it was last in, when it is next booked, what
 * is owed, and what else the owner has here.
 *
 * Money counts as owed once the customer holds the bill: a finished job, or
 * an invoice that has been sent or issued. A job still being written is not
 * a debt yet, whatever is on it.
 */
export async function getVehicleGlance(vehicleId: string) {
  return withAuth(
    async ({ organizationId }): Promise<VehicleGlance | null> => {
      const id = z.string().min(1).parse(vehicleId)
      const vehicle = await db.vehicle.findFirst({
        where: { id, organizationId },
        select: { id: true, customerId: true },
      })
      if (!vehicle) return null

      const [jobs, otherVehicles] = await Promise.all([
        db.serviceRecord.findMany({
          where: { vehicleId: vehicle.id, vehicle: { organizationId } },
          select: {
            id: true,
            status: true,
            serviceDate: true,
            startDateTime: true,
            totalAmount: true,
            cost: true,
            manuallyPaid: true,
            sentAt: true,
            issuedAt: true,
            payments: { select: { amount: true } },
          },
        }),
        vehicle.customerId
          ? db.vehicle.count({
              where: {
                organizationId,
                customerId: vehicle.customerId,
                isArchived: false,
                id: { not: vehicle.id },
              },
            })
          : 0,
      ])

      const now = new Date()
      let openJobs = 0
      let doneJobs = 0
      let lastVisit: Date | null = null
      let lastVisitJobId: string | null = null
      let nextBooking: Date | null = null
      let nextBookingJobId: string | null = null
      let unpaid = 0
      const owed: Record<string, 'unpaid' | 'partial'> = {}

      for (const job of jobs) {
        const done = job.status === 'completed'
        if (done) {
          doneJobs += 1
          const at = job.startDateTime ?? job.serviceDate
          if (!lastVisit || at > lastVisit) {
            lastVisit = at
            lastVisitJobId = job.id
          }
        } else {
          openJobs += 1
          if (job.startDateTime && job.startDateTime >= now) {
            if (!nextBooking || job.startDateTime < nextBooking) {
              nextBooking = job.startDateTime
              nextBookingJobId = job.id
            }
          }
        }

        const billed = done || job.sentAt !== null || job.issuedAt !== null
        const total = job.totalAmount > 0 ? job.totalAmount : job.cost
        if (!billed || total <= 0) continue
        const status = invoicePaymentStatus(job)
        if (status === 'paid') continue
        const paid = job.payments.reduce((sum, p) => sum + p.amount, 0)
        unpaid += Math.max(0, total - paid)
        owed[job.id] = status
      }

      return {
        now: now.toISOString(),
        openJobs,
        doneJobs,
        lastVisit: lastVisit ? lastVisit.toISOString() : null,
        lastVisitJobId,
        nextBooking: nextBooking ? nextBooking.toISOString() : null,
        nextBookingJobId,
        unpaid,
        owed,
        otherVehicles,
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
