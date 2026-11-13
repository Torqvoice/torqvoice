import { z } from 'zod'
import { isDateKey, isTime } from '@/features/workshop-calendar/Lib/calendar'
import { MAX_APPOINTMENT_MINUTES } from './appointmentSchema'

/**
 * Something put on the calendar from the booking dialog: an appointment, or
 * work on a car booked in as a scheduled job.
 */
export const BOOKING_KINDS = ['appointment', 'workOrder'] as const
export type BookingKind = (typeof BOOKING_KINDS)[number]

/**
 * How a notification goes out. The first two reach the workshop: the bell in
 * the app, and an email to whoever set it. The last two reach the customer,
 * through the workshop's own SMS and email.
 */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'customer_sms', 'customer_email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export function isCustomerChannel(channel: string): boolean {
  return channel === 'customer_sms' || channel === 'customer_email'
}

export const NOTIFICATION_UNITS = ['minutes', 'hours', 'days', 'weeks'] as const
export type NotificationUnit = (typeof NOTIFICATION_UNITS)[number]

export const UNIT_MINUTES: Record<NotificationUnit, number> = {
  minutes: 1,
  hours: 60,
  days: 24 * 60,
  weeks: 7 * 24 * 60,
}

/** A notice given in days or weeks goes out at a time of day, not an exact lead. */
export function isDayUnit(unit: string): boolean {
  return unit === 'days' || unit === 'weeks'
}

/** The furthest ahead a notice can go out, as calendars allow: four weeks. */
export const MAX_NOTICE_MINUTES = UNIT_MINUTES.weeks * 4

/** Enough for anyone; a list longer than this is a mistake. */
export const MAX_NOTIFICATIONS = 5

/** What a new booking starts with: the bell in the app, an hour before. */
export const DEFAULT_NOTIFICATION = {
  channel: 'in_app',
  amount: 1,
  unit: 'hours',
} as const satisfies { channel: NotificationChannel; amount: number; unit: NotificationUnit }

/** When a notice in days goes out unless somebody picks another time. */
export const DEFAULT_NOTICE_TIME = '09:00'

export const bookingNotificationSchema = z
  .object({
    channel: z.enum(NOTIFICATION_CHANNELS),
    amount: z.number().int().min(0),
    unit: z.enum(NOTIFICATION_UNITS),
    /** HH:MM on the workshop's clock, for a notice in days or weeks. */
    atTime: z.string().refine(isTime, 'Pick a valid time').nullish(),
  })
  .refine((n) => n.amount * UNIT_MINUTES[n.unit] <= MAX_NOTICE_MINUTES, {
    message: 'A notification can go out at most four weeks before',
    path: ['amount'],
  })
  .transform((n) => ({
    ...n,
    atTime: isDayUnit(n.unit) ? (n.atTime ?? DEFAULT_NOTICE_TIME) : null,
  }))

export type BookingNotification = z.output<typeof bookingNotificationSchema>
export type BookingNotificationInput = z.input<typeof bookingNotificationSchema>

/** Minutes from one wall-clock moment to another, on the same calendar. */
function wallMinutes(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number)
  const [h, min] = time.split(':').map(Number)
  return Date.UTC(y, m - 1, d, h, min) / 60_000
}

export const saveBookingSchema = z
  .object({
    kind: z.enum(BOOKING_KINDS),
    /** The appointment or job being edited; absent for a new booking. */
    id: z.string().min(1).optional(),
    /** An appointment becoming a work order: removed once the job exists. */
    fromAppointmentId: z.string().min(1).optional(),
    title: z.string().trim().min(1, 'Add a title').max(200),
    /** Rich text from the editor; cleaned on the server before it is kept. */
    description: z.string().max(20_000).optional(),
    customerId: z.string().min(1).optional(),
    vehicleId: z.string().min(1).optional(),
    /** Work order only: what needs doing, one concern per line. */
    work: z.string().max(4000).optional(),
    /** YYYY-MM-DD and HH:MM on the workshop's clock, and days that exist. */
    startDate: z.string().refine(isDateKey, 'Pick a valid date'),
    startTime: z.string().refine(isTime, 'Pick a valid time'),
    endDate: z.string().refine(isDateKey, 'Pick a valid date'),
    endTime: z.string().refine(isTime, 'Pick a valid time'),
    notifications: z.array(bookingNotificationSchema).max(MAX_NOTIFICATIONS),
    /** A video call connector to add a meeting through, when one is connected. */
    meetingConnectorId: z.string().min(1).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'workOrder' && !v.vehicleId && !v.customerId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a vehicle or a customer',
        path: ['vehicleId'],
      })
    }
    const minutes = wallMinutes(v.endDate, v.endTime) - wallMinutes(v.startDate, v.startTime)
    if (minutes < 5) {
      ctx.addIssue({ code: 'custom', message: 'End after it starts', path: ['endTime'] })
    } else if (minutes > MAX_APPOINTMENT_MINUTES) {
      ctx.addIssue({ code: 'custom', message: 'At most a week long', path: ['endDate'] })
    }
    if (
      v.notifications.some((n) => isCustomerChannel(n.channel)) &&
      !v.customerId &&
      !v.vehicleId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a customer to notify them',
        path: ['notifications'],
      })
    }
  })

export type SaveBookingInput = z.input<typeof saveBookingSchema>
export type SaveBooking = z.output<typeof saveBookingSchema>
