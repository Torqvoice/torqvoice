'use server'

import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { withAuth } from '@/lib/with-auth'
import type { AuditEvent } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import {
  bookingConcerns,
  bookingParties,
  cleanDescription,
  resourceFor,
  syncNotifications,
  wallClock,
} from '../Lib/booking.server'
import {
  isCustomerChannel,
  type SaveBookingInput,
  saveBookingSchema,
} from '../Schema/bookingSchema'

/**
 * Changes a booking from the calendar: an appointment, or a booked job whose
 * car has not arrived yet.
 *
 * Once the car is in, the job is a live work order and is changed there; the
 * calendar only moves what is still a booking. On a booked job:
 *
 * - The time moves, and the job keeps its bay or technician when that is
 *   still free then; otherwise it takes the first free one, as a new booking
 *   would.
 * - The car can be added to a booking made for a customer whose car was not
 *   on file. A different car or customer is changed on the work order, where
 *   the prices and tax that follow the customer are worked out again.
 * - The work lines are the job's concerns. They are replaced only while
 *   nobody has recorded anything on them; after that they are the job's
 *   history and are changed on the work order.
 */
export async function updateBooking(input: SaveBookingInput) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = saveBookingSchema.parse(input)
      if (!data.id) throw new Error('Nothing to change')
      if (data.fromAppointmentId) throw new Error('An appointment becomes a work order when booked')
      if (data.notifications.some((n) => isCustomerChannel(n.channel))) demoGuard()

      const timeZone = await workshopTimeZone(organizationId)
      const start = wallClock(data.startDate, data.startTime, timeZone)
      const end = wallClock(data.endDate, data.endTime, timeZone)
      const description = cleanDescription(data.description)

      if (data.kind === 'appointment') {
        const existing = await db.appointment.findFirst({
          where: { id: data.id, organizationId },
          select: { id: true },
        })
        if (!existing) throw new Error('Appointment not found')
        const { vehicle, customer } = await bookingParties(organizationId, data)
        const saved = await db.$transaction(async (tx) => {
          const appointment = await tx.appointment.update({
            where: { id: existing.id },
            data: {
              title: data.title,
              description,
              startAt: start,
              endAt: end,
              vehicleId: vehicle?.id ?? null,
              customerId: vehicle?.customerId ?? customer?.id ?? null,
            },
            select: { id: true, title: true, vehicleId: true },
          })
          await syncNotifications(
            tx,
            { organizationId, userId, appointmentId: appointment.id },
            data.notifications
          )
          return appointment
        })
        return {
          kind: 'appointment' as const,
          id: saved.id,
          ref: saved.title,
          vehicleId: saved.vehicleId,
          overbooked: false,
        }
      }

      const job = await db.serviceRecord.findFirst({
        where: { id: data.id, organizationId },
        select: {
          id: true,
          status: true,
          invoiceNumber: true,
          vehicleId: true,
          customerId: true,
          startDateTime: true,
          endDateTime: true,
          technicianId: true,
          workBayId: true,
          concerns: {
            orderBy: { sortOrder: 'asc' },
            select: {
              description: true,
              cause: true,
              correction: true,
              confirmation: true,
              confirmedAt: true,
              _count: { select: { findings: true, attachments: true } },
            },
          },
        },
      })
      if (!job) throw new Error('Work order not found')
      if (job.status !== 'scheduled') {
        throw new Error('The job has started. Change it on the work order.')
      }

      // Who: only a car added to a booking that had none, and only the
      // customer's own.
      let who: { vehicleId: string; customerId: null } | null = null
      if ((data.vehicleId ?? null) !== job.vehicleId) {
        if (job.vehicleId || !data.vehicleId) {
          throw new Error('Change the car on the work order')
        }
        const { vehicle } = await bookingParties(organizationId, { vehicleId: data.vehicleId })
        if (!vehicle) throw new Error('Vehicle not found')
        if (job.customerId && vehicle.customerId !== job.customerId) {
          throw new Error('That car belongs to another customer')
        }
        // A job on a car finds its customer through the car.
        who = { vehicleId: vehicle.id, customerId: null }
      } else if (!job.vehicleId && (data.customerId ?? null) !== job.customerId) {
        throw new Error('Change the customer on the work order')
      }

      const lines = bookingConcerns(data.work, data.title)
      const workChanged = lines.join('\n') !== job.concerns.map((c) => c.description).join('\n')
      if (workChanged) {
        const recorded = job.concerns.some(
          (c) =>
            c.cause ||
            c.correction ||
            c.confirmation ||
            c.confirmedAt ||
            c._count.findings > 0 ||
            c._count.attachments > 0
        )
        if (recorded) {
          throw new Error('Work is recorded on these concerns. Change them on the work order.')
        }
      }

      const moved =
        start.getTime() !== job.startDateTime?.getTime() ||
        end.getTime() !== job.endDateTime?.getTime()
      let holds: { workBayId?: string; technicianId?: string } = {}
      let full = false
      if (moved) {
        const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
        const found = await resourceFor(organizationId, start, minutes, {
          jobId: job.id,
          current: { workBayId: job.workBayId, technicianId: job.technicianId },
        })
        full = found.full
        if (found.resource?.workBayId) holds = { workBayId: found.resource.workBayId }
        else if (found.resource?.technicianId) holds = { technicianId: found.resource.technicianId }
      }

      const saved = await db.$transaction(async (tx) => {
        const record = await tx.serviceRecord.update({
          where: { id: job.id },
          data: {
            title: data.title,
            description,
            startDateTime: start,
            endDateTime: end,
            ...(who ?? {}),
            ...holds,
          },
          select: { id: true, vehicleId: true, invoiceNumber: true },
        })
        if (workChanged) {
          await tx.serviceConcern.deleteMany({ where: { serviceRecordId: job.id } })
          await tx.serviceConcern.createMany({
            data: lines.map((text, sortOrder) => ({
              serviceRecordId: job.id,
              description: text,
              sortOrder,
            })),
          })
        }
        await syncNotifications(
          tx,
          { organizationId, userId, serviceRecordId: job.id },
          data.notifications
        )
        return record
      })
      return {
        kind: 'workOrder' as const,
        id: saved.id,
        ref: saved.invoiceNumber || saved.id,
        vehicleId: saved.vehicleId,
        overbooked: full,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.UPDATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }): AuditEvent =>
        result.kind === 'appointment'
          ? {
              action: 'appointment.update',
              entity: 'Appointment',
              entityId: result.id,
              details: { key: 'appointment_update', params: { title: result.ref } },
            }
          : {
              action: 'service.update',
              entity: 'ServiceRecord',
              entityId: result.id,
              details: { key: 'service_editAppointment', params: { ref: result.ref } },
              metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
            },
    }
  )
}
