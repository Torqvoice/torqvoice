import 'server-only'
import { db } from '@/lib/db'
import { resolveWorkshopTimeZone } from '@/lib/workshop-timezone'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import {
  type Absence,
  type ClosedPeriod,
  type WeekHours,
  type WorkshopCalendar,
  DEFAULT_DAY_END,
  DEFAULT_DAY_START,
  addDays,
  dateKeyOf,
  defaultWeek,
  parseWeekHours,
  repeatYearly,
} from './calendar'
import {
  feedClosures,
  parseChoices,
  parseFeeds,
  parseHolidayCache,
  parseRegions,
  publicHolidayClosures,
} from './holidays'

/**
 * A workshop's calendar for a stretch of days, read from its settings and
 * rows. A plain module, not a server action: it takes an organization id,
 * which must never be something a caller can choose.
 */

const KEYS = [
  SETTING_KEYS.OPENING_HOURS,
  SETTING_KEYS.WORKBOARD_WORK_DAY_START,
  SETTING_KEYS.WORKBOARD_WORK_DAY_END,
  'workboard.showWeekends',
  SETTING_KEYS.TIMEZONE,
  SETTING_KEYS.TIMEZONE_DETECTED,
  SETTING_KEYS.CLOSURES_ENABLED,
  SETTING_KEYS.HOLIDAY_COUNTRY,
  SETTING_KEYS.HOLIDAY_REGIONS,
  SETTING_KEYS.HOLIDAY_CHOICES,
  SETTING_KEYS.HOLIDAY_CACHE,
  SETTING_KEYS.HOLIDAY_FEEDS,
]

export interface LoadedCalendar {
  /** Closed days, holidays and time off are switched on for the workshop. */
  enabled: boolean
  calendar: WorkshopCalendar
}

/** The week the stored settings describe, falling back to the old work day. */
export function weekFromSettings(map: Map<string, string>): WeekHours {
  const fallback = defaultWeek(
    map.get(SETTING_KEYS.WORKBOARD_WORK_DAY_START) || DEFAULT_DAY_START,
    map.get(SETTING_KEYS.WORKBOARD_WORK_DAY_END) || DEFAULT_DAY_END,
    map.get('workboard.showWeekends') === 'true'
  )
  return parseWeekHours(map.get(SETTING_KEYS.OPENING_HOURS), fallback)
}

export function closuresEnabled(value: string | null | undefined): boolean {
  return value !== 'false'
}

/**
 * The calendar from `from` to `to` (both "YYYY-MM-DD", included). Closures
 * and absences outside the stretch are left out; one that runs into it is in.
 */
export async function loadWorkshopCalendar(
  organizationId: string,
  range: { from: string; to: string }
): Promise<LoadedCalendar> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: KEYS } },
    select: { key: true, value: true },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  const timeZone = resolveWorkshopTimeZone(
    map.get(SETTING_KEYS.TIMEZONE),
    map.get(SETTING_KEYS.TIMEZONE_DETECTED)
  )
  const week = weekFromSettings(map)
  const enabled = closuresEnabled(map.get(SETTING_KEYS.CLOSURES_ENABLED))
  if (!enabled) {
    return { enabled, calendar: { timeZone, week, closures: [], absences: [] } }
  }

  const from = new Date(`${range.from}T00:00:00Z`)
  const to = new Date(`${range.to}T00:00:00Z`)
  const [closureRows, absenceRows] = await Promise.all([
    db.workshopClosure.findMany({
      where: {
        organizationId,
        OR: [{ repeatsYearly: true }, { startDate: { lte: to }, endDate: { gte: from } }],
      },
      select: {
        name: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        repeatsYearly: true,
      },
    }),
    db.technicianAbsence.findMany({
      where: { organizationId, startDate: { lte: to }, endDate: { gte: from } },
      select: {
        id: true,
        technicianId: true,
        startDate: true,
        endDate: true,
        startTime: true,
        endTime: true,
        reason: true,
        note: true,
      },
    }),
  ])

  const fromYear = Number(range.from.slice(0, 4))
  const toYear = Number(range.to.slice(0, 4))
  const own: ClosedPeriod[] = closureRows.flatMap((row) => {
    const period: ClosedPeriod = {
      name: row.name,
      source: 'closure',
      startDate: dateKeyOf(row.startDate),
      endDate: dateKeyOf(row.endDate),
      startTime: row.startTime,
      endTime: row.endTime,
    }
    // A stretch over New Year that began last year still touches this one.
    return row.repeatsYearly ? repeatYearly(period, fromYear - 1, toYear) : [period]
  })

  const country = map.get(SETTING_KEYS.HOLIDAY_COUNTRY) || ''
  const cache = parseHolidayCache(map.get(SETTING_KEYS.HOLIDAY_CACHE))
  const holidays =
    country && cache?.country === country
      ? publicHolidayClosures(
          cache,
          parseRegions(map.get(SETTING_KEYS.HOLIDAY_REGIONS)),
          parseChoices(map.get(SETTING_KEYS.HOLIDAY_CHOICES))
        )
      : []
  const feeds = feedClosures(parseFeeds(map.get(SETTING_KEYS.HOLIDAY_FEEDS)))

  const inRange = (p: { startDate: string; endDate: string }) =>
    p.endDate >= range.from && p.startDate <= range.to

  const absences: Absence[] = absenceRows.map((row) => ({
    id: row.id,
    technicianId: row.technicianId,
    startDate: dateKeyOf(row.startDate),
    endDate: dateKeyOf(row.endDate),
    startTime: row.startTime,
    endTime: row.endTime,
    reason: row.reason,
    note: row.note,
  }))

  return {
    enabled,
    calendar: {
      timeZone,
      week,
      closures: [...own, ...holidays, ...feeds]
        .filter(inRange)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
      absences,
    },
  }
}

/** A stretch of `days` days starting the day before `key`, as the loader wants it. */
export function rangeAround(key: string, days: number): { from: string; to: string } {
  return { from: addDays(key, -1), to: addDays(key, days) }
}
