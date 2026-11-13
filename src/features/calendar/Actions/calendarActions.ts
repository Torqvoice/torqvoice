'use server'

import { getTranslations } from 'next-intl/server'
import { connectorName } from '@/features/integrations/Lib/display-name'
import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getManifest } from '@/integrations/registry'
import { accessFor } from '@/lib/viewer-access'
import { sanitizeHtml } from '@/lib/sanitize-html'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { addZonedDays, zonedDate, zonedDayKey, zonedParts } from '@/lib/timezone'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { type ClosedPeriod, eachDay } from '@/features/workshop-calendar/Lib/calendar'

export type CalendarEventType =
  | 'service'
  | 'reminder'
  | 'quote'
  | 'message'
  | 'external'
  /** A day the workshop is closed: a public holiday, a holiday calendar, its own closure. */
  | 'closure'
  /** A technician on leave or out of office. */
  | 'absence'
  /** An appointment with no job behind it: a talk, a test drive, a visit. */
  | 'appointment'

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
  /** Only on appointments: what it is about, as cleaned rich text. */
  description?: string | null
  /** Appointments and booked jobs: how many notifications go out before it. */
  notificationCount?: number
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
    async (ctx) => {
      const { organizationId } = ctx
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

      // Seeing the calendar is reading jobs. What else it lists is somebody
      // else's record and follows that record's own read: a role without
      // quotes sees no quote totals here, one without customers no messages
      // to them. Closed days, time off and connected calendars are the
      // workshop's day, which everyone who plans it needs.
      const access = await accessFor(ctx)
      const sees = {
        reminders: access.reads(PermissionSubject.VEHICLES),
        quotes: access.reads(PermissionSubject.QUOTES),
        messages: access.reads(PermissionSubject.CUSTOMERS),
      }

      const [services, reminders, quotes, scheduledMessages, external, appointments] =
        await Promise.all([
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
              _count: { select: { appointmentNotifications: true } },
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
          sees.reminders
            ? db.reminder.findMany({
                where: {
                  organizationId,
                  dueDate: inRange,
                },
                select: {
                  id: true,
                  title: true,
                  dueDate: true,
                  hasDueTime: true,
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
              })
            : [],
          sees.quotes
            ? db.quote.findMany({
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
              })
            : [],
          sees.messages
            ? db.scheduledMessage.findMany({
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
              })
            : [],
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
          db.appointment.findMany({
            where: { organizationId, startAt: inRange },
            select: {
              id: true,
              title: true,
              description: true,
              startAt: true,
              endAt: true,
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
              _count: { select: { notifications: true } },
            },
            orderBy: { startAt: 'asc' },
          }),
        ])

      const now = new Date()
      const vehicleLabel = (v: { year: number; make: string; model: string } | null) =>
        v ? `${v.year} ${v.make} ${v.model}` : ''

      // Closed days and time off, one all-day (or part-day) entry per day.
      const { calendar } = await loadWorkshopCalendar(organizationId, {
        from: params.start,
        to: params.end,
      })
      const tc = await getTranslations('workshopCalendar')
      const technicianNames = calendar.absences.length
        ? new Map(
            (
              await db.technician.findMany({
                where: {
                  organizationId,
                  id: { in: [...new Set(calendar.absences.map((a) => a.technicianId))] },
                },
                select: { id: true, name: true },
              })
            ).map((tech) => [tech.id, tech.name])
          )
        : new Map<string, string>()
      const dayEntries = (
        stretch: Pick<ClosedPeriod, 'startDate' | 'endDate' | 'startTime' | 'endTime'>,
        make: (day: string, time: string | null, endTime: string | null) => CalendarEvent
      ) => {
        const first = stretch.startDate < params.start ? params.start : stretch.startDate
        const last = stretch.endDate > params.end ? params.end : stretch.endDate
        if (first > last) return []
        return eachDay(first, last).map((day) => {
          const time = day === stretch.startDate ? (stretch.startTime ?? null) : null
          const until = day === stretch.endDate ? (stretch.endTime ?? null) : null
          // Part of a day is a timed block; a whole day stays an all-day item.
          return time || until
            ? make(day, time ?? '00:00', until ?? '23:59')
            : make(day, null, null)
        })
      }
      const blank = {
        vehicleId: null,
        vehicleLabel: '',
        customerName: null,
        invoiceNumber: null,
        amount: null,
      }
      // A holiday listed by two sources is one entry a day.
      const seenClosure = new Set<string>()
      const closureEvents: CalendarEvent[] = calendar.closures.flatMap((c, i) =>
        dayEntries(c, (day, time, endTime) => ({
          ...blank,
          id: `closure:${i}:${day}`,
          title: c.name,
          date: day,
          time,
          endTime,
          type: 'closure',
          status: 'closed',
          allDay: time === null,
          source: c.source,
        })).filter((event) => {
          const id = `${event.date}|${event.title.toLocaleLowerCase()}|${event.time ?? ''}`
          if (seenClosure.has(id)) return false
          seenClosure.add(id)
          return true
        })
      )
      const absenceEvents: CalendarEvent[] = calendar.absences.flatMap((a) =>
        dayEntries(a, (day, time, endTime) => ({
          ...blank,
          id: `absence:${a.id}:${day}`,
          title: tc('calendar.absenceTitle', {
            name: technicianNames.get(a.technicianId) ?? '',
            reason: tc.has(`reasons.${a.reason}`) ? tc(`reasons.${a.reason}`) : a.reason,
          }),
          date: day,
          time,
          endTime,
          type: 'absence',
          status: 'away',
          allDay: time === null,
        }))
      )

      const ti = await getTranslations('integrations')
      const externalEvents: CalendarEvent[] = []
      for (const e of external) {
        // One entry per day the event covers, capped so a year-long block
        // does not flood the month. The last instant belongs to the day it
        // falls on, so an event ending at midnight stops the day before.
        const firstKey = zonedDayKey(e.startAt, timeZone)
        const lastKey = zonedDayKey(new Date(e.endAt.getTime() - 1), timeZone)
        const sourceManifest = getManifest(e.connection.connectorId)
        const source = sourceManifest ? connectorName(ti, sourceManifest) : null
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
        ...closureEvents,
        ...absenceEvents,
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
            notificationCount: s._count.appointmentNotifications,
          }
        }),
        ...appointments.map((a) => {
          const date = zonedDayKey(a.startAt, timeZone)
          return {
            id: a.id,
            title: a.title,
            date,
            time: toTimeStr(a.startAt, timeZone),
            endTime:
              a.endAt > a.startAt
                ? zonedDayKey(a.endAt, timeZone) === date
                  ? toTimeStr(a.endAt, timeZone)
                  : '23:59'
                : null,
            type: 'appointment' as const,
            status: 'booked',
            vehicleId: a.vehicleId,
            vehicleLabel: vehicleLabel(a.vehicle),
            customerName: (a.customer ?? a.vehicle?.customer)?.name ?? null,
            invoiceNumber: null,
            amount: null,
            description: a.description ? sanitizeHtml(a.description) : null,
            notificationCount: a._count.notifications,
          }
        }),
        ...reminders
          .filter((r) => r.dueDate !== null)
          .map((r) => ({
            id: r.id,
            title: r.title,
            date: zonedDayKey(r.dueDate!, timeZone),
            time: r.hasDueTime ? toTimeStr(r.dueDate!, timeZone) : null,
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
