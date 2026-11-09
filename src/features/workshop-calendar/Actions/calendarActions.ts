'use server'

import { withAuth } from '@/lib/with-auth'
import { daysBetween, isDateKey } from '../Lib/calendar'
import { loadWorkshopCalendar } from '../Lib/loadCalendar.server'

/**
 * The workshop's calendar for a stretch of days: hours per weekday, closed
 * days with their names, and who is away. Read by the work board, the
 * calendar and the scheduler, so anyone signed in to the workshop may read it.
 */
export async function getWorkshopCalendar(input: { from: string; to: string }) {
  return withAuth(async ({ organizationId }) => {
    if (!isDateKey(input.from) || !isDateKey(input.to)) throw new Error('Invalid dates')
    const span = daysBetween(input.from, input.to)
    if (span < 0 || span > 400) throw new Error('Ask for at most a year at a time')
    return loadWorkshopCalendar(organizationId, input)
  })
}
