'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getManifest } from '@/integrations/registry'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { addZonedDays, zonedDate, zonedDayKey, zonedParts } from '@/lib/timezone'

export type CalendarEventType = 'service' | 'reminder' | 'quote' | 'message' | 'external'

export type CalendarEvent = {
  id: string
  title: string
  date: string // YYYY-MM-DD in the workshop's timezone
  time: string | null // HH:MM in the workshop's timezone, or null for an all-day item
  /** HH:MM when the record knows when it ends; the views pick a default otherwise. */
  endTime?: string | null
  type: CalendarEventType
  status: string
  /** Only on scheduled-message events: email | sms | telegram | in_app */
  channel?: string
  vehicleId: string | null
  vehicleLabel: string
  customerName: string | null
  invoiceNumber: string | null
  amount: number | null
  /** Only on external events: whether it fills the day, where it came from. */
  allDay?: boolean
  source?: string | null
  externalUrl?: string | null
}

function parseDayKey(value: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function toTimeStr(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/**
 * Everything the calendar shows between two days, inclusive, read in the
 * workshop's own timezone. The server may run in UTC; a job booked for 10:00
 * in Oslo has to land on the 10:00 row here and not at 08:00.
 */
export async function getCalendarEvents(params: { start: string; end: string }) {
  return withAuth(
    async ({ organizationId }) => {
      const timeZone = await workshopTimeZone(organizationId)
      const startKey = parseDayKey(params.start)
      const endKey = parseDayKey(params.end)
      if (!startKey || !endKey) return []

      const start = zonedDate(startKey.year, startKey.month, startKey.day, 0, 0, timeZone)
      // First instant of the day after the range, so a job at 23:30 on the
      // last day is still inside it.
      const endExclusive = addZonedDays(
        zonedDate(endKey.year, endKey.month, endKey.day, 0, 0, timeZone),
        1,
        timeZone
      )
      const inRange = { gte: start, lt: endExclusive }

      const [services, reminders, quotes, scheduledMessages, external] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            organizationId,
            OR: [
              { startDateTime: inRange },
              // A job entered with only a service date, never put on the
              // board, still belongs on its day.
              { startDateTime: null, serviceDate: inRange },
            ],
          },
          select: {
            id: true,
            title: true,
            serviceDate: true,
            startDateTime: true,
            endDateTime: true,
            status: true,
            invoiceNumber: true,
            totalAmount: true,
            cost: true,
            vehicleId: true,
            customer: { select: { name: true } },
            vehicle: {
              select: {
                make: true,
                model: true,
                year: true,
                customer: { select: { name: true } },
              },
            },
          },
          orderBy: [{ startDateTime: { sort: 'asc', nulls: 'last' } }, { serviceDate: 'asc' }],
        }),
        db.reminder.findMany({
          where: {
            organizationId,
            dueDate: inRange,
          },
          select: {
            id: true,
            title: true,
            dueDate: true,
            isCompleted: true,
            vehicleId: true,
            customer: { select: { name: true } },
            vehicle: {
              select: {
                make: true,
                model: true,
                year: true,
                customer: { select: { name: true } },
              },
            },
          },
          orderBy: { dueDate: 'asc' },
        }),
        db.quote.findMany({
          where: {
            organizationId,
            validUntil: inRange,
            status: { notIn: ['converted', 'rejected'] },
          },
          select: {
            id: true,
            title: true,
            quoteNumber: true,
            validUntil: true,
            status: true,
            totalAmount: true,
            vehicleId: true,
            vehicle: {
              select: {
                make: true,
                model: true,
                year: true,
                customer: { select: { name: true } },
              },
            },
            customer: { select: { name: true } },
          },
          orderBy: { validUntil: 'asc' },
        }),
        db.scheduledMessage.findMany({
          where: {
            organizationId,
            status: { not: 'cancelled' },
            sendAt: inRange,
          },
          select: {
            id: true,
            channel: true,
            subject: true,
            body: true,
            recipient: true,
            status: true,
            sendAt: true,
            vehicleId: true,
            customer: { select: { name: true } },
            vehicle: { select: { make: true, model: true, year: true } },
          },
          orderBy: { sendAt: 'asc' },
        }),
        // Busy time pulled from connected calendars; read-only on this side.
        db.externalCalendarEvent.findMany({
          where: { organizationId, startAt: { lt: endExclusive }, endAt: { gt: start } },
          select: {
            id: true,
            title: true,
            startAt: true,
            endAt: true,
            allDay: true,
            remoteUrl: true,
            connection: { select: { connectorId: true } },
          },
          orderBy: { startAt: 'asc' },
        }),
      ])

      const now = new Date()
      const vehicleLabel = (v: { year: number; make: string; model: string } | null) =>
        v ? `${v.year} ${v.make} ${v.model}` : ''

      const externalEvents: CalendarEvent[] = []
      for (const e of external) {
        // One entry per day the event covers, capped so a year-long block
        // does not flood the month. The last instant belongs to the day it
        // falls on, so an event ending at midnight stops the day before.
        const firstKey = zonedDayKey(e.startAt, timeZone)
        const lastKey = zonedDayKey(new Date(e.endAt.getTime() - 1), timeZone)
        const source = getManifest(e.connection.connectorId)?.name ?? null
        let day = e.startAt
        for (let n = 0; n < 31; n++) {
          const key = zonedDayKey(day, timeZone)
          if (key > lastKey) break
          const isFirst = key === firstKey
          const isLast = key === lastKey
          if (key >= params.start && key <= params.end) {
            externalEvents.push({
              id: `${e.id}:${n}`,
              title: e.title,
              date: key,
              time: e.allDay ? null : isFirst ? toTimeStr(e.startAt, timeZone) : '00:00',
              endTime: e.allDay ? null : isLast ? toTimeStr(e.endAt, timeZone) : '23:59',
              type: 'external',
              status: 'busy',
              vehicleId: null,
              vehicleLabel: '',
              customerName: null,
              invoiceNumber: null,
              amount: null,
              allDay: e.allDay,
              source,
              externalUrl: e.remoteUrl,
            })
          }
          day = addZonedDays(day, 1, timeZone)
        }
      }

      const events: CalendarEvent[] = [
        ...externalEvents,
        ...services.map((s) => {
          const startsAt = s.startDateTime
          const date = zonedDayKey(startsAt ?? s.serviceDate, timeZone)
          // An end on a later day is drawn to the end of this one; the
          // calendar shows single-day blocks.
          const endTime =
            startsAt && s.endDateTime && s.endDateTime > startsAt
              ? zonedDayKey(s.endDateTime, timeZone) === date
                ? toTimeStr(s.endDateTime, timeZone)
                : '23:59'
              : null
          return {
            id: s.id,
            title: s.title,
            date,
            time: startsAt ? toTimeStr(startsAt, timeZone) : null,
            endTime,
            type: 'service' as const,
            status: s.status,
            vehicleId: s.vehicleId,
            vehicleLabel: vehicleLabel(s.vehicle),
            customerName: (s.customer ?? s.vehicle?.customer)?.name ?? null,
            invoiceNumber: s.invoiceNumber,
            amount: s.totalAmount > 0 ? s.totalAmount : s.cost > 0 ? s.cost : null,
          }
        }),
        ...reminders
          .filter((r) => r.dueDate !== null)
          .map((r) => ({
            id: r.id,
            title: r.title,
            date: zonedDayKey(r.dueDate!, timeZone),
            time: null,
            type: 'reminder' as const,
            status: r.isCompleted ? 'completed' : r.dueDate! < now ? 'overdue' : 'upcoming',
            vehicleId: r.vehicleId,
            vehicleLabel: vehicleLabel(r.vehicle),
            customerName: (r.customer ?? r.vehicle?.customer)?.name ?? null,
            invoiceNumber: null,
            amount: null,
          })),
        ...quotes
          .filter((q) => q.validUntil !== null && q.vehicleId !== null)
          .map((q) => ({
            id: q.id,
            title: q.title,
            date: zonedDayKey(q.validUntil!, timeZone),
            time: null,
            type: 'quote' as const,
            status: q.status,
            vehicleId: q.vehicleId!,
            vehicleLabel: vehicleLabel(q.vehicle),
            customerName: q.customer?.name ?? q.vehicle?.customer?.name ?? null,
            invoiceNumber: q.quoteNumber,
            amount: q.totalAmount > 0 ? q.totalAmount : null,
          })),
        ...scheduledMessages.map((m) => ({
          id: m.id,
          // A subject reads better in a day cell than the first line of the body
          title: m.subject?.trim() || m.body.slice(0, 60),
          date: zonedDayKey(m.sendAt, timeZone),
          time: toTimeStr(m.sendAt, timeZone),
          type: 'message' as const,
          // "scheduled" | "sent" | "failed", carrying the channel for the icon
          status: m.status,
          channel: m.channel,
          vehicleId: m.vehicleId,
          vehicleLabel: vehicleLabel(m.vehicle),
          customerName: m.customer?.name ?? m.recipient ?? null,
          invoiceNumber: null,
          amount: null,
        })),
      ]

      return events
    },
    {
      requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SERVICES }],
    }
  )
}
