'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'

export type CalendarEvent = {
  id: string
  title: string
  date: string // YYYY-MM-DD local date
  time: string | null // HH:MM or null
  type: 'service' | 'reminder' | 'quote' | 'message' | 'external'
  status: string
  /** Only on scheduled-message events: email | sms | telegram | in_app */
  channel?: string
  vehicleId: string | null
  vehicleLabel: string
  customerName: string | null
  invoiceNumber: string | null
  amount: number | null
}

/** Format a Date as YYYY-MM-DD in local time (avoids UTC shift from toISOString) */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function toTimeStr(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export async function getCalendarEvents(params: { start: string; end: string }) {
  return withAuth(
    async ({ organizationId }) => {
      const start = new Date(params.start)
      const end = new Date(params.end)
      end.setHours(23, 59, 59, 999)

      const [services, reminders, quotes, scheduledMessages, external] = await Promise.all([
        db.serviceRecord.findMany({
          where: {
            organizationId,
            startDateTime: { gte: start, lte: end },
          },
          select: {
            id: true,
            title: true,
            serviceDate: true,
            startDateTime: true,
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
            dueDate: { gte: start, lte: end },
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
            validUntil: { gte: start, lte: end },
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
            sendAt: { gte: start, lte: end },
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
          where: { organizationId, startAt: { lte: end }, endAt: { gte: start } },
          select: { id: true, title: true, startAt: true, endAt: true, allDay: true },
          orderBy: { startAt: 'asc' },
        }),
      ])

      const externalEvents: CalendarEvent[] = []
      for (const e of external) {
        // One entry per day the event covers, capped so a year-long block
        // does not flood the month.
        const first = new Date(e.startAt)
        const last = new Date(e.endAt.getTime() - 1)
        for (let d = new Date(first), n = 0; d <= last && n < 31; d.setDate(d.getDate() + 1), n++) {
          if (d < start || d > end) continue
          externalEvents.push({
            id: `${e.id}:${n}`,
            title: e.title,
            date: toLocalDateStr(d),
            time: e.allDay || n > 0 ? null : toTimeStr(e.startAt),
            type: 'external' as const,
            status: 'busy',
            vehicleId: null,
            vehicleLabel: '',
            customerName: null,
            invoiceNumber: null,
            amount: null,
          })
        }
      }

      const events: CalendarEvent[] = [
        ...externalEvents,
        ...services.map((s) => ({
          id: s.id,
          title: s.title,
          date: toLocalDateStr(s.startDateTime ?? s.serviceDate),
          time: s.startDateTime ? toTimeStr(s.startDateTime) : null,
          type: 'service' as const,
          status: s.status,
          vehicleId: s.vehicleId,
          vehicleLabel: s.vehicle ? `${s.vehicle.year} ${s.vehicle.make} ${s.vehicle.model}` : '',
          customerName: (s.customer ?? s.vehicle?.customer)?.name ?? null,
          invoiceNumber: s.invoiceNumber,
          amount: s.totalAmount > 0 ? s.totalAmount : s.cost > 0 ? s.cost : null,
        })),
        ...reminders
          .filter((r) => r.dueDate !== null)
          .map((r) => ({
            id: r.id,
            title: r.title,
            date: toLocalDateStr(r.dueDate!),
            time: null,
            type: 'reminder' as const,
            status: r.isCompleted
              ? 'completed'
              : new Date(r.dueDate!) < new Date()
                ? 'overdue'
                : 'upcoming',
            vehicleId: r.vehicleId,
            vehicleLabel: r.vehicle ? `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}` : '',
            customerName: (r.customer ?? r.vehicle?.customer)?.name ?? null,
            invoiceNumber: null,
            amount: null,
          })),
        ...quotes
          .filter((q) => q.validUntil !== null && q.vehicleId !== null)
          .map((q) => ({
            id: q.id,
            title: q.title,
            date: toLocalDateStr(q.validUntil!),
            time: null,
            type: 'quote' as const,
            status: q.status,
            vehicleId: q.vehicleId!,
            vehicleLabel: q.vehicle ? `${q.vehicle.year} ${q.vehicle.make} ${q.vehicle.model}` : '',
            customerName: q.customer?.name ?? q.vehicle?.customer?.name ?? null,
            invoiceNumber: q.quoteNumber,
            amount: q.totalAmount > 0 ? q.totalAmount : null,
          })),
        ...scheduledMessages.map((m) => ({
          id: m.id,
          // A subject reads better in a day cell than the first line of the body
          title: m.subject?.trim() || m.body.slice(0, 60),
          date: toLocalDateStr(m.sendAt),
          time: toTimeStr(m.sendAt),
          type: 'message' as const,
          // "scheduled" | "sent" | "failed", carrying the channel for the icon
          status: m.status,
          channel: m.channel,
          vehicleId: m.vehicleId,
          vehicleLabel: m.vehicle ? `${m.vehicle.year} ${m.vehicle.make} ${m.vehicle.model}` : '',
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
