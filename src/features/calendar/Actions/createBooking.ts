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
 *
 * Booked once however often it is sent. The dialog makes up a token when it
 * opens and sends it with the booking; what gets booked carries it, unique
 * within the workshop. When the answer to the first send is lost (the
 * network dropped, the server restarted under a deploy) the dialog shows a
 * failure and stays filled in, and the second press finds the first booking
 * by its token instead of making another with the next job number.
 *
 * Named `createBookingOnce` because the token is required: a tab opened
 * before this existed calls `createBooking`, which is gone, and is asked to
 * reload rather than book without one.
 */
export async function createBookingOnce(input: SaveBookingInput) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = saveBookingSchema.parse(input)
      if (data.id) throw new Error('This booking already exists')
      const token = data.token
      if (!token) throw new Error('This booking has no token')
      // Before anything else is looked up: an appointment that became a work
      // order the first time is gone by now, and must not read as an error.
      const already = await bookedWith(organizationId, token)
      if (already) return already
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
        const booking = db.$transaction(async (tx) => {
          const appointment = await tx.appointment.create({
            data: {
              organizationId,
              bookingToken: token,
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
        const created = await booking.catch(theOneBooked(organizationId, token))
        if ('kind' in created) return created
        return {
          kind: 'appointment' as const,
          id: created.id,
          ref: created.title,
          vehicleId: created.vehicleId,
          overbooked: false,
          repeated: false,
        }
      }

      const minutes = Math.round((end.getTime() - start.getTime()) / 60_000)
      const { resource, full } = await resourceFor(organizationId, start, minutes)
      const booking = db.$transaction(async (tx) => {
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
            bookingToken: token,
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
      const job = await booking.catch(theOneBooked(organizationId, token))
      if ('kind' in job) return job
      // Booked all the same when everything is taken then: the office may
      // fill an hour the booking page would refuse. The dialog says so.
      return {
        kind: 'workOrder' as const,
        id: job.id,
        ref: job.invoiceNumber || job.id,
        vehicleId: job.vehicleId,
        overbooked: full,
        repeated: false,
      }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      // Written down when it was booked, not again each time it is found.
      audit: ({ result }): AuditEvent | null =>
        result.repeated
          ? null
          : result.kind === 'appointment'
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

/** What the dialog is told it booked. `repeated` when it was booked before. */
type Booked = {
  kind: 'appointment' | 'workOrder'
  id: string
  ref: string
  vehicleId: string | null
  overbooked: boolean
  repeated: boolean
}

/** What this token already booked in this workshop, if it booked anything. */
async function bookedWith(organizationId: string, token: string): Promise<Booked | null> {
  const [job, appointment] = await Promise.all([
    db.serviceRecord.findFirst({
      where: { organizationId, bookingToken: token },
      select: { id: true, vehicleId: true, invoiceNumber: true },
    }),
    db.appointment.findFirst({
      where: { organizationId, bookingToken: token },
      select: { id: true, title: true, vehicleId: true },
    }),
  ])
  if (job) {
    return {
      kind: 'workOrder',
      id: job.id,
      ref: job.invoiceNumber || job.id,
      vehicleId: job.vehicleId,
      // Said the first time, if it was; nothing was taken from anyone now.
      overbooked: false,
      repeated: true,
    }
  }
  if (appointment) {
    return {
      kind: 'appointment',
      id: appointment.id,
      ref: appointment.title,
      vehicleId: appointment.vehicleId,
      overbooked: false,
      repeated: true,
    }
  }
  return null
}

/**
 * Two sends of one booking that arrive together both find nothing booked
 * and both write. The database lets one through and refuses the other its
 * token, or, for an appointment being made a work order, finds the
 * appointment already gone. The one refused answers with what the other
 * booked; anything else that went wrong is still what went wrong.
 */
function theOneBooked(organizationId: string, token: string) {
  return async (error: unknown): Promise<Booked> => {
    const code = (error as { code?: string } | null)?.code
    if (code !== 'P2002' && code !== 'P2025') throw error
    const already = await bookedWith(organizationId, token)
    if (!already) throw error
    return already
  }
}
