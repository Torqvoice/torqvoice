import { zonedDate, zonedParts } from '@/lib/timezone'
import { isDayUnit, type NotificationUnit, UNIT_MINUTES } from '../Schema/bookingSchema'

export interface NotificationTiming {
  amount: number
  unit: NotificationUnit | string
  atTime: string | null
}

/**
 * When a notification goes out for something starting at `start`.
 *
 * Minutes and hours count back from the start. Days and weeks count back
 * whole days on the workshop's calendar and go out at the time of day given,
 * the way a calendar's "1 day before at 16:00" does: a 09:30 appointment on
 * Monday warns on Sunday at 16:00, however the clocks change in between.
 */
export function notificationFiresAt(
  start: Date,
  timing: NotificationTiming,
  timeZone: string
): Date {
  if (isDayUnit(timing.unit) && timing.atTime) {
    const days = timing.amount * (timing.unit === 'weeks' ? 7 : 1)
    const [hour, minute] = timing.atTime.split(':').map(Number)
    const p = zonedParts(start, timeZone)
    return zonedDate(p.year, p.month, p.day - days, hour, minute, timeZone)
  }
  const perUnit = UNIT_MINUTES[timing.unit as NotificationUnit] ?? 0
  return new Date(start.getTime() - timing.amount * perUnit * 60_000)
}

/**
 * Whether a notification is due now: its time has come, the appointment has
 * not started, it has not gone out for this start yet, and it was not set
 * after its time had already passed (a calendar does not fire a notice for
 * an hour-away event booked half an hour ahead).
 */
export function isNotificationDue(
  input: {
    start: Date
    timing: NotificationTiming
    sentForStart: Date | null
    setAt: Date
  },
  now: Date,
  timeZone: string
): boolean {
  if (now >= input.start) return false
  if (input.sentForStart && input.sentForStart.getTime() === input.start.getTime()) return false
  const firesAt = notificationFiresAt(input.start, input.timing, timeZone)
  return firesAt <= now && firesAt >= input.setAt
}
