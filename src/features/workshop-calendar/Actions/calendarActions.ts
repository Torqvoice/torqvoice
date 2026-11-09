'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { daysBetween, isDateKey } from '../Lib/calendar'
import { loadWorkshopCalendar } from '../Lib/loadCalendar.server'

/**
 * The workshop's calendar for a stretch of days: hours per weekday, closed
 * days with their names, and who is away, with the reason and note. The work
 * board reads it, so it takes the board's read right, the same as the leave
 * list does.
 */
export async function getWorkshopCalendar(input: { from: string; to: string }) {
  return withAuth(
    async ({ organizationId }) => {
      if (!isDateKey(input.from) || !isDateKey(input.to)) throw new Error('Invalid dates')
      const span = daysBetween(input.from, input.to)
      if (span < 0 || span > 400) throw new Error('Ask for at most a year at a time')
      return loadWorkshopCalendar(organizationId, input)
    },
    {
      requiredPermissions: [
        { action: PermissionAction.READ, subject: PermissionSubject.WORK_BOARD },
      ],
    }
  )
}
