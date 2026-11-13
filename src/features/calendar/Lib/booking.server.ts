import { db } from '@/lib/db'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { zonedDate } from '@/lib/timezone'
import { loadBookingContext } from '@/features/workboard/Lib/bookings'
import {
  type Resource,
  bookingResources,
  freeResources,
} from '@/features/inspection-reminders/Lib/booking'
import type { BookingNotification } from '../Schema/bookingSchema'
import { appointmentConcerns } from './appointment'

/*
 * The parts of booking from the calendar that more than one action needs. A
 * plain module rather than part of an action: a 'use server' file exposes
 * every export as an endpoint, and these take an organization id, which must
 * never be something a caller can choose.
 */

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0]

/** A day and a time on the workshop's clock, as the instant it is. */
export function wallClock(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return zonedDate(year, month, day, hour, minute, timeZone)
}

/**
 * What a booked job occupies, by the rule online booking counts with: a bay
 * when the shop has any, else a technician (`bookingResources`).
 *
 * A job being moved keeps what it holds when that is still free at the new
 * time, and is left out of the clash check so it does not collide with
 * itself. Otherwise the first one free for the whole stretch, preferring the
 * workshop's default technician among technicians, so the job lands where a
 * new job would. `full` when the shop has something to hold and all of it is
 * taken then; the booking stands without one and the office is told.
 */
export async function resourceFor(
  organizationId: string,
  start: Date,
  durationMinutes: number,
  opts: { jobId?: string; current?: Resource } = {}
): Promise<{ resource: Resource | null; full: boolean }> {
  const resources = await bookingResources(organizationId)
  if (resources.length === 0) return { resource: null, full: false }
  // From the day before the start to the day after the end, as loadBookingContext reads.
  const { bookings } = await loadBookingContext(organizationId, start, {
    days: Math.ceil(durationMinutes / (24 * 60)) + 1,
  })
  const others = opts.jobId ? bookings.filter((b) => b.id !== opts.jobId) : bookings
  const free = freeResources(start, durationMinutes, resources, others)
  if (free.length === 0) return { resource: null, full: true }
  const current = opts.current
  if (current?.workBayId || current?.technicianId) {
    const still = free.find(
      (r) =>
        (current.workBayId && r.workBayId === current.workBayId) ||
        (current.technicianId && r.technicianId === current.technicianId)
    )
    if (still) return { resource: still, full: false }
  }
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

/**
 * The car and the customer a booking names, looked up in this workshop:
 * ids from the browser can belong to another one. A car brings its owner;
 * a customer is only looked up for a booking without a car.
 */
export async function bookingParties(
  organizationId: string,
  ids: { vehicleId?: string; customerId?: string }
) {
  const vehicle = ids.vehicleId
    ? await db.vehicle.findFirst({
        where: { id: ids.vehicleId, organizationId },
        select: { id: true, customerId: true, customer: { select: { taxExempt: true } } },
      })
    : null
  if (ids.vehicleId && !vehicle) throw new Error('Vehicle not found')
  const customer =
    !vehicle && ids.customerId
      ? await db.customer.findFirst({
          where: { id: ids.customerId, organizationId },
          select: { id: true, taxExempt: true },
        })
      : null
  if (!vehicle && ids.customerId && !customer) throw new Error('Customer not found')
  return { vehicle, customer }
}

/** The description as it is kept: cleaned, and nothing at all when it says nothing. */
export function cleanDescription(html: string | undefined): string | null {
  if (!html) return null
  const clean = sanitizeHtml(html).trim()
  const text = clean
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim()
  return text ? clean : null
}

/** A booked job's concerns: the work lines, or the title when none were given. */
export function bookingConcerns(work: string | undefined, title: string): string[] {
  const lines = appointmentConcerns(work ?? '')
  return lines.length > 0 ? lines : [title.trim()]
}

const sameTiming = (
  a: { channel: string; amount: number; unit: string; atTime: string | null },
  b: { channel: string; amount: number; unit: string; atTime: string | null }
) => a.channel === b.channel && a.amount === b.amount && a.unit === b.unit && a.atTime === b.atTime

/**
 * Makes a booking's notifications the ones asked for. One that is still
 * wanted is left exactly as it was, keeping who set it (the email is theirs)
 * and whether it has already gone out; the rest go, and new ones are set by
 * the person saving.
 */
export async function syncNotifications(
  tx: Tx,
  owner: { organizationId: string; userId: string } & (
    | { appointmentId: string; serviceRecordId?: never }
    | { serviceRecordId: string; appointmentId?: never }
  ),
  wanted: BookingNotification[]
) {
  const target = owner.appointmentId
    ? { appointmentId: owner.appointmentId }
    : { serviceRecordId: owner.serviceRecordId as string }
  const existing = await tx.appointmentNotification.findMany({
    where: { organizationId: owner.organizationId, ...target },
    select: { id: true, channel: true, amount: true, unit: true, atTime: true },
  })
  const kept = new Set<string>()
  const toCreate: BookingNotification[] = []
  for (const n of wanted) {
    const match = existing.find((e) => !kept.has(e.id) && sameTiming(e, n))
    if (match) kept.add(match.id)
    else toCreate.push(n)
  }
  const gone = existing.filter((e) => !kept.has(e.id)).map((e) => e.id)
  if (gone.length > 0) {
    await tx.appointmentNotification.deleteMany({
      where: { id: { in: gone }, organizationId: owner.organizationId },
    })
  }
  if (toCreate.length > 0) {
    await tx.appointmentNotification.createMany({
      data: toCreate.map((n) => ({
        organizationId: owner.organizationId,
        userId: owner.userId,
        ...target,
        channel: n.channel,
        amount: n.amount,
        unit: n.unit,
        atTime: n.atTime,
      })),
    })
  }
}
