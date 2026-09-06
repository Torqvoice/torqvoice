'use server'

import { getTranslations } from 'next-intl/server'
import { z } from 'zod'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { db } from '@/lib/db'
import { notify } from '@/lib/notify'
import { serviceRecordHref } from '@/lib/service-record'
import { type BookableDay, availabilityFor, claimableResource } from '../Lib/booking'
import { type InspectionReminderSettings, loadInspectionReminderSettings } from '../Lib/settings'

/**
 * The public side of a reminder link. No sign-in: the token was sent to the
 * customer's own phone or address, which is the same standing a one-time
 * code has, and it can only act on the one vehicle it was minted for.
 */

/** Per token, per minute. A person taps a few times; a script does not get to try more. */
const LIMIT_PER_MINUTE = 30
const budgets = new Map<string, { count: number; resetAt: number }>()
function guard(token: string): void {
  const now = Date.now()
  const entry = budgets.get(token)
  if (!entry || entry.resetAt <= now) {
    budgets.set(token, { count: 1, resetAt: now + 60_000 })
    return
  }
  entry.count += 1
  if (entry.count > LIMIT_PER_MINUTE) throw new Error('Too many requests, try again in a minute')
}

const tokenSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/)

export type BookingState = 'open' | 'booked' | 'expired' | 'cancelled' | 'unavailable'

export interface BookingPage {
  state: BookingState
  workshop: { name: string; logoUrl: string | null; phone: string | null }
  vehicle: { label: string; licensePlate: string | null }
  dueAt: string
  expiresAt: string
  bookingMode: 'direct' | 'request'
  durationMinutes: number
  /** The workshop's zone; every time on the page is shown in it. */
  timeZone: string
  booking: { start: string; end: string; pendingApproval: boolean } | null
  days: BookableDay[]
  firstStart: string | null
}

async function loadSend(token: string) {
  const send = await db.inspectionReminderSend.findUnique({
    where: { token },
    select: {
      id: true,
      organizationId: true,
      customerId: true,
      vehicleId: true,
      dueAt: true,
      expiresAt: true,
      bookedAt: true,
      cancelledAt: true,
      bookedServiceRecordId: true,
      bookedServiceRequestId: true,
      channel: true,
      recipient: true,
      campaign: { select: { createdById: true } },
      vehicle: {
        select: { year: true, make: true, model: true, licensePlate: true, isArchived: true },
      },
      customer: { select: { name: true } },
    },
  })
  return send
}

type Send = NonNullable<Awaited<ReturnType<typeof loadSend>>>

async function currentBooking(send: Send) {
  if (send.bookedServiceRecordId) {
    const r = await db.serviceRecord.findUnique({
      where: { id: send.bookedServiceRecordId },
      select: { startDateTime: true, endDateTime: true, status: true },
    })
    if (r?.startDateTime && r.endDateTime && r.status !== 'cancelled') {
      return { start: r.startDateTime, end: r.endDateTime, pendingApproval: false }
    }
  }
  if (send.bookedServiceRequestId) {
    const r = await db.serviceRequest.findUnique({
      where: { id: send.bookedServiceRequestId },
      select: { preferredDate: true, status: true },
    })
    if (r?.preferredDate && r.status !== 'cancelled') {
      return {
        start: r.preferredDate,
        end: new Date(r.preferredDate.getTime() + 60 * 60_000),
        pendingApproval: true,
      }
    }
  }
  return null
}

function stateOf(
  send: Send,
  booking: Awaited<ReturnType<typeof currentBooking>>,
  now: Date
): BookingState {
  if (booking && booking.start.getTime() > now.getTime()) return 'booked'
  if (send.cancelledAt && !booking) return now > send.expiresAt ? 'expired' : 'open'
  if (now > send.expiresAt) return 'expired'
  return 'open'
}

async function workshopOf(organizationId: string, settings: InspectionReminderSettings) {
  const logo = await db.appSetting.findUnique({
    where: { organizationId_key: { organizationId, key: SETTING_KEYS.COMPANY_LOGO } },
    select: { value: true },
  })
  return {
    name: settings.workshopName,
    logoUrl: logo?.value ? `/api/public/logo/${organizationId}` : null,
    phone: settings.phone,
  }
}

export async function getBookingPage(rawToken: string): Promise<BookingPage | null> {
  const token = tokenSchema.safeParse(rawToken)
  if (!token.success) return null
  guard(token.data)
  const send = await loadSend(token.data)
  if (!send || send.vehicle.isArchived) return null
  const now = new Date()
  const settings = await loadInspectionReminderSettings(send.organizationId)
  const booking = await currentBooking(send)
  let state = stateOf(send, booking, now)
  const workshop = await workshopOf(send.organizationId, settings)
  const base = {
    workshop,
    vehicle: {
      label: `${send.vehicle.year} ${send.vehicle.make} ${send.vehicle.model}`,
      licensePlate: send.vehicle.licensePlate,
    },
    dueAt: send.dueAt.toISOString(),
    expiresAt: send.expiresAt.toISOString(),
    bookingMode: settings.bookingMode,
    durationMinutes: settings.durationMinutes,
    timeZone: settings.timeZone,
    booking: booking
      ? {
          start: booking.start.toISOString(),
          end: booking.end.toISOString(),
          pendingApproval: booking.pendingApproval,
        }
      : null,
  }
  if (state !== 'open') return { ...base, state, days: [], firstStart: null }
  const availability = await availabilityFor(send.organizationId, settings, now)
  if (availability.resources.length === 0) state = 'unavailable'
  return { ...base, state, days: availability.days, firstStart: availability.firstStart }
}

const confirmSchema = z.object({
  token: tokenSchema,
  start: z.string().datetime(),
  note: z.string().max(500).optional(),
})

/**
 * Book the chosen start. The slot is checked again here against everything
 * on the board, so two customers tapping the same time cannot both get it.
 */
export async function confirmBooking(raw: unknown) {
  const input = confirmSchema.parse(raw)
  guard(input.token)
  const send = await loadSend(input.token)
  if (!send || send.vehicle.isArchived) throw new Error('This link is not valid')
  const now = new Date()
  const existing = await currentBooking(send)
  if (stateOf(send, existing, now) !== 'open') throw new Error('This link can no longer book')

  const settings = await loadInspectionReminderSettings(send.organizationId)
  const start = new Date(input.start)
  const resource = await claimableResource(send.organizationId, settings, start, now)
  if (!resource) throw new Error('That time was just taken, please pick another')
  const end = new Date(start.getTime() + settings.durationMinutes * 60_000)

  const t = await getTranslations('portal.booking')
  const vehicleLabel = `${send.vehicle.year} ${send.vehicle.make} ${send.vehicle.model}`
  const title = t('workOrderTitle', { vehicle: vehicleLabel })
  const note = input.note?.trim() || null

  let recordId: string | null = null
  let requestId: string | null = null
  let entityUrl: string
  if (settings.bookingMode === 'direct') {
    const record = await db.serviceRecord.create({
      data: {
        title,
        description: note,
        type: 'inspection',
        status: 'scheduled',
        serviceDate: start,
        startDateTime: start,
        endDateTime: end,
        technicianId: resource.technicianId ?? null,
        workBayId: resource.workBayId ?? null,
        customerId: send.customerId,
        vehicleId: send.vehicleId,
        organizationId: send.organizationId,
        bookingSource: 'online',
      },
      select: { id: true, vehicleId: true },
    })
    recordId = record.id
    entityUrl = serviceRecordHref(record)
  } else {
    const request = await db.serviceRequest.create({
      data: {
        description: note ? `${title}\n${note}` : title,
        preferredDate: start,
        customerId: send.customerId,
        vehicleId: send.vehicleId,
        organizationId: send.organizationId,
      },
      select: { id: true },
    })
    requestId = request.id
    entityUrl = `/customers/${send.customerId}?tab=requests`
  }

  await db.inspectionReminderSend.update({
    where: { id: send.id },
    data: {
      bookedAt: now,
      cancelledAt: null,
      bookedServiceRecordId: recordId,
      bookedServiceRequestId: requestId,
    },
  })

  const when = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(start)
  await notify({
    organizationId: send.organizationId,
    type: 'online_booking',
    title: t('notificationTitle'),
    message: t('notificationBody', {
      customer: send.customer.name,
      vehicle: send.vehicle.licensePlate
        ? `${vehicleLabel} (${send.vehicle.licensePlate})`
        : vehicleLabel,
      when,
    }),
    entityType: recordId ? 'service_record' : 'service_request',
    entityId: recordId ?? (requestId as string),
    entityUrl,
  })

  // Confirmation on the channel the reminder came on, through the same queue.
  await db.scheduledMessage.create({
    data: {
      organizationId: send.organizationId,
      createdById: send.campaign.createdById,
      channel: send.channel,
      subject:
        send.channel === 'email'
          ? t('confirmationSubject', { workshop: settings.workshopName })
          : null,
      body: t(settings.bookingMode === 'direct' ? 'confirmationBody' : 'confirmationBodyRequest', {
        workshop: settings.workshopName,
        vehicle: vehicleLabel,
        when,
        phone: settings.phone ?? '',
      }),
      recipient: send.recipient,
      customerId: send.customerId,
      vehicleId: send.vehicleId,
      sendAt: now,
      frequency: 'once',
      status: 'scheduled',
    },
  })

  return { start: start.toISOString(), end: end.toISOString(), pendingApproval: !recordId }
}

/** Free the slot again. The link stays usable for a new time while it is open. */
export async function cancelBooking(rawToken: string) {
  const token = tokenSchema.parse(rawToken)
  guard(token)
  const send = await loadSend(token)
  if (!send) throw new Error('This link is not valid')
  const now = new Date()
  const booking = await currentBooking(send)
  if (!booking || booking.start.getTime() <= now.getTime()) {
    throw new Error('There is no upcoming booking to cancel')
  }
  const t = await getTranslations('portal.booking')
  const vehicleLabel = `${send.vehicle.year} ${send.vehicle.make} ${send.vehicle.model}`

  if (send.bookedServiceRecordId) {
    // Only the placeholder the link created, and only while nobody has
    // started on it. Anything else stays for the office to decide.
    await db.serviceRecord.deleteMany({
      where: {
        id: send.bookedServiceRecordId,
        organizationId: send.organizationId,
        bookingSource: 'online',
        status: 'scheduled',
      },
    })
  }
  if (send.bookedServiceRequestId) {
    await db.serviceRequest.updateMany({
      where: { id: send.bookedServiceRequestId, organizationId: send.organizationId },
      data: { status: 'cancelled' },
    })
  }
  await db.inspectionReminderSend.update({
    where: { id: send.id },
    data: { cancelledAt: now, bookedServiceRecordId: null, bookedServiceRequestId: null },
  })
  await notify({
    organizationId: send.organizationId,
    type: 'online_booking_cancelled',
    title: t('cancelledNotificationTitle'),
    message: t('cancelledNotificationBody', {
      customer: send.customer.name,
      vehicle: vehicleLabel,
      when: new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: (await loadInspectionReminderSettings(send.organizationId)).timeZone,
      }).format(booking.start),
    }),
    entityType: 'vehicle',
    entityId: send.vehicleId,
    entityUrl: `/vehicles/${send.vehicleId}`,
  })
  return { ok: true }
}
