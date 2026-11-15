import 'server-only'

import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { addDays, dayState } from '@/features/workshop-calendar/Lib/calendar'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { db } from '@/lib/db'
import { zonedDayKey, zonedParts } from '@/lib/timezone'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import type { PortalOpeningHours } from '../Actions/portalActions'

/** How far ahead, and how many, of the closed days the portal names. */
const CLOSED_SOON_DAYS = 60
const CLOSED_SOON_MAX = 5

/**
 * The workshop's week and the days soon it shuts or opens for less, read from
 * the workshop calendar on the workshop's clock. The one reading of it: the
 * signed-in pages and the front page both come here, so they never disagree.
 *
 * Not a server action: it takes an organization id, which is the session's or
 * the one the portal address resolved to, never something a visitor passes in.
 * It hands back the week and the closed days and nothing else: no staff time
 * off, no closure beyond its name and the hours still open that day. The week
 * always shows; closed days only on days the workshop would otherwise open,
 * since a holiday on a Sunday changes nothing for a closed-on-Sunday shop.
 */
export async function readPortalOpeningHours(organizationId: string): Promise<PortalOpeningHours> {
  const timeZone = await workshopTimeZone(organizationId)
  const today = zonedDayKey(new Date(), timeZone)
  const last = addDays(today, CLOSED_SOON_DAYS)
  const [{ calendar }, format] = await Promise.all([
    loadWorkshopCalendar(organizationId, { from: today, to: last }),
    db.appSetting.findFirst({
      where: { organizationId, key: SETTING_KEYS.TIME_FORMAT },
      select: { value: true },
    }),
  ])

  const clock = (at: Date) => {
    const p = zonedParts(at, timeZone)
    return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
  }
  const closedSoon: PortalOpeningHours['closedSoon'] = []
  for (let day = today; day <= last && closedSoon.length < CLOSED_SOON_MAX; day = addDays(day, 1)) {
    const state = dayState(calendar, day)
    // A holiday on a day the workshop never opens changes nothing.
    if (state.closures.length === 0 || state.closedWeekday) continue
    if (state.open && !state.shortened) continue
    closedSoon.push({
      date: day,
      name: state.closures.map((c) => c.name).join(', '),
      open: state.intervals.map((i) => ({ start: clock(i.start), end: clock(i.end) })),
    })
  }

  return {
    week: calendar.week.map(({ open, start, end }) => ({ open, start, end })),
    today,
    timeFormat: format?.value === '24h' ? '24h' : '12h',
    closedSoon,
  }
}

/**
 * Whether the workshop has set its opening hours itself. Until it saves them
 * in the workshop calendar there is no stored week, and the calendar answers
 * with a default one (weekdays, the work board's day) that nobody chose.
 */
async function openingHoursSetByWorkshop(organizationId: string): Promise<boolean> {
  const row = await db.appSetting.findFirst({
    where: { organizationId, key: SETTING_KEYS.OPENING_HOURS },
    select: { value: true },
  })
  return Boolean(row?.value?.trim())
}

/**
 * The opening hours for the portal's front page, where nobody is signed in
 * yet and the hours are shown to the public.
 *
 * `hoursText` is what the workshop typed as its hours in the portal settings.
 * A workshop that typed its hours but never set them in the calendar gets its
 * own words, not a default week it never chose: null is returned so the page
 * shows the text. Hours set in the calendar always win over the text. With
 * neither, the calendar's default week shows, as it does once signed in.
 *
 * Null too when the calendar cannot be read or has no day open, so the page
 * can fall back to the text.
 */
export async function loadPortalOpeningHours(
  organizationId: string,
  hoursText?: string | null
): Promise<PortalOpeningHours | null> {
  try {
    if (hoursText?.trim() && !(await openingHoursSetByWorkshop(organizationId))) return null
    const hours = await readPortalOpeningHours(organizationId)
    return hours.week.some((day) => day.open) ? hours : null
  } catch (error) {
    // The front page still works without the hours; the text fallback shows.
    console.error('[portal] opening hours for the front page:', error)
    return null
  }
}
