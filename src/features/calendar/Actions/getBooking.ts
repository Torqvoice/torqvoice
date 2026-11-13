'use server'

import { z } from 'zod'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { zonedDateInput, zonedTimeInput } from '@/lib/timezone'
import { serviceVideoLink } from '@/features/integrations/Lib/video-call'
import { BOOKING_KINDS, type BookingKind, type NotificationChannel } from '../Schema/bookingSchema'

const vehicleSelect = {
  id: true,
  make: true,
  model: true,
  year: true,
  licensePlate: true,
  customerId: true,
  customer: { select: { id: true, name: true } },
} as const

const notificationSelect = {
  select: { channel: true, amount: true, unit: true, atTime: true },
  orderBy: { createdAt: 'asc' as const },
}

export interface BookingForEdit {
  kind: BookingKind
  id: string
  title: string
  description: string
  customer: { id: string; name: string; company: string | null } | null
  vehicle: {
    id: string
    make: string
    model: string
    year: number
    licensePlate: string | null
    customerId: string | null
    customer: { id: string; name: string } | null
  } | null
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  /** Work order only: the concerns, one per line. */
  work: string
  notifications: {
    channel: NotificationChannel
    amount: number
    unit: string
    atTime: string | null
  }[]
  /** What the dialog shows but does not let change here, and why. */
  locked: { who: boolean; work: boolean }
  /** The video call already on the job, if any. */
  meeting: { url: string; provider: string } | null
}

/**
 * A booking as the dialog edits it: an appointment, or a booked job whose
 * car has not arrived, read on the workshop's clock.
 */
export async function getBooking(input: { kind: BookingKind; id: string }) {
  return withAuth(
    async ({ organizationId }): Promise<BookingForEdit> => {
      const { kind, id } = z
        .object({ kind: z.enum(BOOKING_KINDS), id: z.string().min(1) })
        .parse(input)
      const timeZone = await workshopTimeZone(organizationId)
      const times = (start: Date, end: Date) => ({
        startDate: zonedDateInput(start, timeZone),
        startTime: zonedTimeInput(start, timeZone),
        endDate: zonedDateInput(end, timeZone),
        endTime: zonedTimeInput(end, timeZone),
      })

      if (kind === 'appointment') {
        const a = await db.appointment.findFirst({
          where: { id, organizationId },
          select: {
            id: true,
            title: true,
            description: true,
            startAt: true,
            endAt: true,
            customer: { select: { id: true, name: true, company: true } },
            vehicle: { select: vehicleSelect },
            notifications: notificationSelect,
          },
        })
        if (!a) throw new Error('Appointment not found')
        return {
          kind,
          id: a.id,
          title: a.title,
          description: a.description ?? '',
          customer: a.customer,
          vehicle: a.vehicle,
          ...times(a.startAt, a.endAt),
          work: '',
          notifications: a.notifications as BookingForEdit['notifications'],
          locked: { who: false, work: false },
          meeting: null,
        }
      }

      const job = await db.serviceRecord.findFirst({
        where: { id, organizationId },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          startDateTime: true,
          endDateTime: true,
          customer: { select: { id: true, name: true, company: true } },
          vehicle: {
            select: {
              ...vehicleSelect,
              customer: { select: { id: true, name: true, company: true } },
            },
          },
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
          appointmentNotifications: notificationSelect,
        },
      })
      if (!job) throw new Error('Work order not found')
      if (job.status !== 'scheduled' || !job.startDateTime) {
        throw new Error('The job has started. Change it on the work order.')
      }
      const end =
        job.endDateTime && job.endDateTime > job.startDateTime
          ? job.endDateTime
          : new Date(job.startDateTime.getTime() + 60 * 60_000)
      const recorded = job.concerns.some(
        (c) =>
          c.cause ||
          c.correction ||
          c.confirmation ||
          c.confirmedAt ||
          c._count.findings > 0 ||
          c._count.attachments > 0
      )
      return {
        kind,
        id: job.id,
        title: job.title,
        description: job.description ?? '',
        // A job on a car finds its customer through the car.
        customer: job.customer ?? job.vehicle?.customer ?? null,
        vehicle: job.vehicle,
        ...times(job.startDateTime, end),
        work: job.concerns.map((c) => c.description).join('\n'),
        notifications: job.appointmentNotifications as BookingForEdit['notifications'],
        locked: { who: Boolean(job.vehicle), work: recorded },
        meeting: await serviceVideoLink(organizationId, job.id),
      }
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
