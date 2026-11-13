'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDate } from '@/lib/timezone'
import { createDraftRecord } from '@/features/vehicles/Lib/createDraftRecord'
import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import {
  type Resource,
  bookingResources,
  freeResources,
} from '@/features/inspection-reminders/Lib/booking'
import { bookAppointmentSchema, type BookAppointmentInput } from '../Schema/appointmentSchema'
import { appointmentConcerns, appointmentTitle } from '../Lib/appointment'

/**
 * Books a car or a customer in from the calendar without going through the
 * work order page.
 *
 * The booking is a job like any other, so the work board, the technician app
 * and online booking all see the time as taken, and nothing has to be copied
 * across when the car arrives. It starts out `scheduled`: checking the car in
 * or clocking on moves it on, as with a customer's own online booking. What
 * the customer wants done becomes the job's concerns, one per line, which is
 * what the printed work order lists under work requested.
 *
 * It holds a bay, or in a shop without bays a technician, the same way an
 * online booking does (see `resourceFor`). A job holding neither is invisible
 * to the online booking page, which would then offer the same hour to a
 * customer.
 */
export async function bookAppointment(input: BookAppointmentInput) {
  return withAuth(
    async ({ organizationId, userId }) => {
      const data = bookAppointmentSchema.parse(input)

      // Ids from the browser can belong to another workshop.
      const vehicle = data.vehicleId
        ? await db.vehicle.findFirst({
            where: { id: data.vehicleId, organizationId },
            select: { id: true, customer: { select: { taxExempt: true } } },
          })
        : null
      if (data.vehicleId && !vehicle) throw new Error('Vehicle not found')

      // A job on a car finds its customer through the car, so a customer is
      // only looked up for a booking that has no car yet.
      const customer =
        !vehicle && data.customerId
          ? await db.customer.findFirst({
              where: { id: data.customerId, organizationId },
              select: { id: true, taxExempt: true },
            })
          : null
      if (!vehicle && !customer) throw new Error('Customer not found')

      const timeZone = await workshopTimeZone(organizationId)
      const [year, month, day] = data.date.split('-').map(Number)
      const [hour, minute] = data.time.split(':').map(Number)
      const start = zonedDate(year, month, day, hour, minute, timeZone)
      const end = new Date(start.getTime() + data.durationMinutes * 60_000)
      const concerns = appointmentConcerns(data.work)
      const { resource, full } = await resourceFor(organizationId, start, data.durationMinutes)

      const record = await db.$transaction(async (tx) => {
        const created = await createDraftRecord(
          { organizationId, userId },
          {
            vehicleId: vehicle?.id ?? null,
            customerId: vehicle ? null : (customer?.id ?? null),
            customerExempt: vehicle
              ? (vehicle.customer?.taxExempt ?? false)
              : (customer?.taxExempt ?? false),
            title: appointmentTitle(data.work),
            startDateTime: start,
            endDateTime: end,
            technicianId: resource?.technicianId ?? undefined,
            workBayId: resource?.workBayId ?? undefined,
            // Work on a car even before the car is on file.
            shopWork: true,
            tx,
          }
        )
        return tx.serviceRecord.update({
          where: { id: created.id },
          data: {
            status: 'scheduled',
            description: data.work,
            concerns: {
              create: concerns.map((description, sortOrder) => ({ description, sortOrder })),
            },
          },
          select: { id: true, vehicleId: true, invoiceNumber: true },
        })
      })
      // Booked all the same: the office may fill an hour the booking page
      // would refuse. The dialog says so, and the board shows the clash.
      return { ...record, overbooked: full }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.CREATE, subject: PermissionSubject.SERVICES },
      ],
      audit: ({ result }) => ({
        action: 'service.create',
        entity: 'ServiceRecord',
        entityId: result.id,
        details: {
          key: 'service_bookAppointment',
          params: { ref: result.invoiceNumber || result.id },
        },
        metadata: { serviceRecordId: result.id, vehicleId: result.vehicleId },
      }),
    }
  )
}

/**
 * What the appointment occupies, by the rule online booking counts with: a
 * bay when the shop has any, else a technician (`bookingResources`). The
 * first one free for the whole appointment, preferring the workshop's
 * default technician among technicians, so the job lands where a new job
 * would. `full` when the shop has something to hold and all of it is taken
 * then; the appointment is booked without a resource and the office is told.
 */
async function resourceFor(
  organizationId: string,
  start: Date,
  durationMinutes: number
): Promise<{ resource: Resource | null; full: boolean }> {
  const resources = await bookingResources(organizationId)
  if (resources.length === 0) return { resource: null, full: false }
  // From the day before the start to the day after the end, as loadBookingContext reads.
  const { bookings } = await loadBookingContext(organizationId, start, {
    days: Math.ceil(durationMinutes / (24 * 60)) + 1,
  })
  const free = freeResources(start, durationMinutes, resources, bookings)
  if (free.length === 0) return { resource: null, full: true }
  if (free[0].technicianId) {
    const preferred = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId, key: 'workshop.defaultTechnicianId' } },
      select: { value: true },
    })
    const theirs = free.find((r) => r.technicianId === preferred?.value)
    if (theirs) return { resource: theirs, full: false }
  }
  return { resource: free[0], full: false }
}
