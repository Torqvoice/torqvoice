/**
 * What every calendar connector shares.
 *
 * A work order becomes a calendar event the same way whichever calendar it
 * lands in: same title, same description, same rule for a missing end time.
 * Busy time pulled back is stored the same way too, so the workshop calendar
 * reads one table regardless of vendor.
 */

import { db } from '@/lib/db'
import type { ConnectorContext } from './types'

export const SERVICE_ENTITY = 'ServiceRecord'
export const DEFAULT_DURATION_MINUTES = 60
/** How far back and forward a pull looks. */
export const PULL_PAST_DAYS = 7
export const PULL_FUTURE_DAYS = 60

export interface CalendarEventDraft {
  title: string
  description: string
  start: Date
  end: Date
  url: string
  /** Stable hash of what matters, so unchanged records are not re-pushed. */
  checksum: string
}

export interface ServiceForCalendar {
  id: string
  title: string
  status: string
  startDateTime: Date | null
  endDateTime: Date | null
  invoiceNumber: string | null
  vehicleId: string | null
  vehicle: { year: number; make: string; model: string; licensePlate: string | null } | null
  customer: { name: string; phone: string | null } | null
}

export async function loadServiceForCalendar(
  organizationId: string,
  serviceRecordId: string
): Promise<ServiceForCalendar | null> {
  return db.serviceRecord.findFirst({
    where: { id: serviceRecordId, organizationId },
    select: {
      id: true,
      title: true,
      status: true,
      startDateTime: true,
      endDateTime: true,
      invoiceNumber: true,
      vehicleId: true,
      vehicle: { select: { year: true, make: true, model: true, licensePlate: true } },
      customer: { select: { name: true, phone: true } },
    },
  })
}

export function serviceUrl(
  appUrl: string,
  record: { id: string; vehicleId: string | null }
): string {
  return record.vehicleId
    ? `${appUrl}/vehicles/${record.vehicleId}/service/${record.id}`
    : `${appUrl}/sales/${record.id}`
}

/** Statuses that mean the appointment no longer belongs on a calendar. */
const REMOVED_STATUSES = new Set(['cancelled', 'canceled'])

/**
 * Null when the record should have no event: it is unscheduled or cancelled.
 * Callers then delete whatever was pushed before.
 */
export function draftCalendarEvent(
  record: ServiceForCalendar,
  options: { appUrl: string; includeCustomer: boolean; durationMinutes?: number }
): CalendarEventDraft | null {
  if (!record.startDateTime) return null
  if (REMOVED_STATUSES.has(record.status)) return null
  const start = record.startDateTime
  const end =
    record.endDateTime && record.endDateTime > start
      ? record.endDateTime
      : new Date(start.getTime() + (options.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000)

  const vehicle = record.vehicle
    ? [record.vehicle.year, record.vehicle.make, record.vehicle.model].filter(Boolean).join(' ')
    : null
  const titleParts = [record.title]
  if (vehicle) titleParts.push(vehicle)
  if (options.includeCustomer && record.customer?.name) titleParts.push(record.customer.name)
  const title = titleParts.join(' · ')

  const url = serviceUrl(options.appUrl, record)
  const lines: string[] = []
  if (record.customer?.name) lines.push(`Customer: ${record.customer.name}`)
  if (options.includeCustomer && record.customer?.phone)
    lines.push(`Phone: ${record.customer.phone}`)
  if (vehicle)
    lines.push(
      `Vehicle: ${vehicle}${record.vehicle?.licensePlate ? ` (${record.vehicle.licensePlate})` : ''}`
    )
  if (record.invoiceNumber) lines.push(`Invoice: ${record.invoiceNumber}`)
  lines.push(`Status: ${record.status}`)
  lines.push('', url)
  const description = lines.join('\n')

  const checksum = simpleHash(
    [title, description, start.toISOString(), end.toISOString()].join('|')
  )
  return { title, description, start, end, url, checksum }
}

function simpleHash(input: string): string {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h.toString(16)
}

export interface PulledEvent {
  remoteId: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  updatedAt: Date | null
}

export function pullWindow(now = new Date()): { from: Date; to: Date } {
  const from = new Date(now.getTime() - PULL_PAST_DAYS * 86_400_000)
  const to = new Date(now.getTime() + PULL_FUTURE_DAYS * 86_400_000)
  return { from, to }
}

/**
 * Replace the cached busy time for one calendar with what the vendor
 * returned for the window. Events this connection pushed itself are left
 * out, otherwise every work order would show twice.
 */
export async function storePulledEvents(
  ctx: ConnectorContext,
  calendarId: string,
  events: PulledEvent[],
  window: { from: Date; to: Date }
): Promise<{ stored: number; removed: number }> {
  const ours = await ctx.links.remoteIds(SERVICE_ENTITY)
  const keep = events.filter((e) => !ours.has(e.remoteId) && e.end > e.start)
  const connectionId = ctx.connection.id
  const organizationId = ctx.connection.organizationId

  const result = await db.$transaction(async (tx) => {
    const removed = await tx.externalCalendarEvent.deleteMany({
      where: {
        connectionId,
        calendarId,
        OR: [
          { startAt: { gte: window.from, lte: window.to } },
          { remoteId: { notIn: keep.map((e) => e.remoteId) } },
        ],
      },
    })
    if (keep.length) {
      await tx.externalCalendarEvent.createMany({
        data: keep.map((e) => ({
          connectionId,
          organizationId,
          calendarId,
          remoteId: e.remoteId,
          title: e.title.slice(0, 200) || '(busy)',
          startAt: e.start,
          endAt: e.end,
          allDay: e.allDay,
          remoteUpdatedAt: e.updatedAt,
        })),
        skipDuplicates: true,
      })
    }
    return { stored: keep.length, removed: removed.count }
  })
  return result
}

export async function clearPulledEvents(connectionId: string): Promise<void> {
  await db.externalCalendarEvent.deleteMany({ where: { connectionId } })
}
