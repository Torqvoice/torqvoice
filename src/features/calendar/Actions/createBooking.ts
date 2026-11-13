'use server'

import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { withAuth } from '@/lib/with-auth'
import type { AuditEvent } from '@/lib/audit'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
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
 * Puts something on the calendar from the booking dialog.
 *
 * An appointment is only that: a time, who it is with, what it is about, and
 * the notifications before it. Work on a car is booked as a job like any
 * other, so the work board, the technician app and online booking all see
 * the time as taken, and nothing has to be copied across when the car
 * arrives. The job starts out `scheduled` and holds a bay, or in a shop
 * without bays a technician, as an online booking does (`resourceFor`).
 *
 * An appointment can become a work order: the dialog opens on it, and the
 * appointment goes once the job exists, in the same transaction.
 */
export async function createBooking(input: SaveBookingInput) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = saveBookingSchema.parse(input)
      if (data.id) throw new Error('This booking already exists')
      // A message to the customer will go out from the workshop's own SMS or
      // email, which the public demo must not do.
      if (data.notifications.some((n) => isCustomerChannel(n.channel))) demoGuard()

      const timeZone = await workshopTimeZone(organizationId)
      const start = wallClock(data.startDate, data.startTime, timeZone)
      const end = wallClock(data.endDate, data.endTime, timeZone)
      const { vehicle, customer } = await bookingParties(organizationId, data)
      const description = cleanDescription(data.description)

      const from = data.fromAppointmentId
        ? await db.appointment.findFirst({
            where: { id: data.fromAppointmentId, organizationId },
            select: { id: true },
          })
        : null
      if (data.fromAppointmentId && !from) throw new Error('Appointment not found')

      if (data.kind === 'appointment') {
        if (from) throw new Error('An appointment becomes a work order, not another appointment')
        const created = await db.$transaction(async (tx) => {
          const appointment = await tx.appointment.create({
            data: {
              organizationId,
              title: data.title,
              description,
              startAt: start,
              endAt: end,
              vehicleId: vehicle?.id ?? null,
              // A car brings its owner.
              customerId: vehicle?.customerId ?? customer?.id ?? null,
              createdById: userId,
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
          id: created.id,
          ref: created.title,
          vehicleId: created.vehicleId,
          overbooked: false,
        }
      }

      const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
      const { resource, full } = await resourceFor(organizationId, start, minutes)
      const job = await db.$transaction(async (tx) => {
        const created = await createDraftRecord(
          { organizationId, userId },
          {
            vehicleId: vehicle?.id ?? null,
            customerId: vehicle ? null : (customer?.id ?? null),
            customerExempt: vehicle
              ? (vehicle.customer?.taxExempt ?? false)
              : (customer?.taxExempt ?? false),
            title: data.title,
            startDateTime: start,
            endDateTime: end,
            technicianId: resource?.technicianId ?? undefined,
            workBayId: resource?.workBayId ?? undefined,
            // Work on a car even before the car is on file.
            shopWork: true,
            tx,
          }
        )
        const record = await tx.serviceRecord.update({
          where: { id: created.id },
          data: {
            status: 'scheduled',
            description,
            concerns: {
              create: bookingConcerns(data.work, data.title).map((text, sortOrder) => ({
                description: text,
                sortOrder,
              })),
            },
          },
          select: { id: true, vehicleId: true, invoiceNumber: true },
        })
        await syncNotifications(
          tx,
          { organizationId, userId, serviceRecordId: record.id },
          data.notifications
        )
        if (from) await tx.appointment.delete({ where: { id: from.id } })
        return record
      })
      // Booked all the same when everything is taken then: the office may
      // fill an hour the booking page would refuse. The dialog says so.
      return {
        kind: 'workOrder' as const,
        id: job.id,
        ref: job.invoiceNumber || job.id,
        vehicleId: job.vehicleId,
        overbooked: full,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }): AuditEvent =>
        result.kind === 'appointment'
          ? {
              action: 'appointment.create',
              entity: 'Appointment',
              entityId: result.id,
              details: { key: 'appointment_create', params: { title: result.ref } },
            }
          : {
              action: 'service.create',
              entity: 'ServiceRecord',
              entityId: result.id,
              details: { key: 'service_bookAppointment', params: { ref: result.ref } },
              metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
            },
    }
  )
}
