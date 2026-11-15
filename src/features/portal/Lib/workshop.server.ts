import 'server-only'

import { cache } from 'react'
import { getTranslations } from 'next-intl/server'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { formatClock } from '@/features/workboard/utils/clock'
import { dayState } from '@/features/workshop-calendar/Lib/calendar'
import { loadWorkshopCalendar } from '@/features/workshop-calendar/Lib/loadCalendar.server'
import { db } from '@/lib/db'
import { zonedDayKey } from '@/lib/timezone'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { workshopHoursLine, workshopHoursNow } from './homeData'
import type { PortalWorkshop } from './homeTypes'
import { readPortalOpeningHours } from './openingHours.server'
import { loadPortalLook } from './portalLook.server'

/**
 * A side read a page can do without: today's hours, the week. A failure
 * there costs a line, never the page.
 */
async function quietly<T>(what: string, load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch (error) {
    console.error(`[portal] ${what} failed:`, error)
    return fallback
  }
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * The workshop as the portal shows it: name, logo, how to reach it, whether
 * it is open right now on its own clock, and its week. One read per request:
 * the shell (for the header) and the home both ask.
 *
 * `organizationId` is the session's, or the one the portal address resolved
 * to; `name` is that organization's name. Marine is here too, since every
 * page needs to know whether to say "car" or "boat".
 */
export const loadPortalWorkshop = cache(
  async (organizationId: string, name: string): Promise<PortalWorkshop & { marine: boolean }> => {
    const now = new Date()
    const [rows, timeZone, look, t] = await Promise.all([
      db.appSetting.findMany({
        where: {
          organizationId,
          key: {
            in: [
              SETTING_KEYS.WORKSHOP_PHONE,
              SETTING_KEYS.WORKSHOP_EMAIL,
              SETTING_KEYS.WORKSHOP_ADDRESS,
              SETTING_KEYS.SERVICE_TYPE,
              SETTING_KEYS.TIME_FORMAT,
            ],
          },
        },
        select: { key: true, value: true },
      }),
      workshopTimeZone(organizationId),
      loadPortalLook(organizationId),
      getTranslations('portal.hoursLine'),
    ])
    const setting = (key: string) => rows.find((row) => row.key === key)?.value?.trim() || null
    const timeFormat = setting(SETTING_KEYS.TIME_FORMAT) === '24h' ? '24h' : '12h'

    // Today's opening hours, on the workshop's clock.
    const today = zonedDayKey(now, timeZone)
    const [intervals, hours] = await Promise.all([
      quietly('opening hours today', async () => {
        const { calendar } = await loadWorkshopCalendar(organizationId, { from: today, to: today })
        return dayState(calendar, today).intervals
      }, []),
      quietly('opening hours', () => readPortalOpeningHours(organizationId), null),
    ])
    const hoursNow = workshopHoursNow(intervals, now, timeZone)
    const line = workshopHoursLine(hoursNow)
    const phone = setting(SETTING_KEYS.WORKSHOP_PHONE)
    const address = setting(SETTING_KEYS.WORKSHOP_ADDRESS)

    return {
      name,
      logoUrl: look.logoUrl,
      phone,
      phoneHref: phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null,
      email: setting(SETTING_KEYS.WORKSHOP_EMAIL),
      address,
      directionsUrl: address
        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
        : null,
      ...hoursNow,
      openLine: line.time
        ? t(line.key, { time: formatClock(minutesOf(line.time), timeFormat) })
        : t(line.key),
      hours,
      marine: setting(SETTING_KEYS.SERVICE_TYPE) === 'marine',
    }
  }
)

/**
 * How the workshop prints a time: its zone and its 12 or 24 hour clock. For
 * client components that print times themselves (the chat), which cannot be
 * handed `PortalHomeFormat`'s functions.
 */
export const portalClock = cache(
  async (organizationId: string): Promise<{ timeZone: string; timeFormat: '12h' | '24h' }> => {
    const [timeZone, row] = await Promise.all([
      workshopTimeZone(organizationId),
      db.appSetting.findFirst({
        where: { organizationId, key: SETTING_KEYS.TIME_FORMAT },
        select: { value: true },
      }),
    ])
    return { timeZone, timeFormat: row?.value === '24h' ? '24h' : '12h' }
  }
)
