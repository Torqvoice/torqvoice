import { formatClock } from '@/features/workboard/utils/clock'
import { weekdayOf } from '@/features/workshop-calendar/Lib/calendar'
import type { PortalOpeningHours } from '../../Actions/portalActions'

/** Monday first: how most of the world reads a week of opening hours. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export interface PortalWeekLine {
  /** "Mon to Fri", or "Saturday" for a day on its own. */
  days: string
  /** "07:30 to 17:00", or "closed". */
  hours: string
  /** Today is one of these days. */
  today: boolean
}

/**
 * The workshop's week in as few lines as it takes: days that keep the same
 * hours and follow each other share a line ("Mon to Fri 07:30 to 17:00",
 * "Saturday 09:00 to 13:00", "Sunday closed"). Shared by every theme's
 * sign-in page.
 *
 * `t` is `getTranslations('portal.signIn')`; `locale` names the days.
 */
export function portalWeekLines(
  hours: PortalOpeningHours,
  locale: string,
  t: (key: string, values?: Record<string, string>) => string
): PortalWeekLine[] {
  // 7 January 2024 was a Sunday, so day 7 + n is weekday n.
  const name = (weekday: number, length: 'short' | 'long') =>
    new Intl.DateTimeFormat(locale, { weekday: length, timeZone: 'UTC' }).format(
      new Date(Date.UTC(2024, 0, 7 + weekday))
    )
  const capital = (text: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
  const todayWeekday = weekdayOf(hours.today)
  const sameHours = (a: number, b: number) => {
    const x = hours.week[a]
    const y = hours.week[b]
    if (!x?.open || !y?.open) return !x?.open && !y?.open
    return x.start === y.start && x.end === y.end
  }

  const runs: number[][] = []
  for (const weekday of WEEK_ORDER) {
    const run = runs[runs.length - 1]
    if (run && sameHours(run[0], weekday)) run.push(weekday)
    else runs.push([weekday])
  }

  return runs.map((run) => {
    const day = hours.week[run[0]]
    return {
      days:
        run.length === 1
          ? capital(name(run[0], 'long'))
          : t('dayRange', {
              from: capital(name(run[0], 'short')),
              to: capital(name(run[run.length - 1], 'short')),
            }),
      hours: day?.open
        ? t('timeRange', {
            start: formatClock(minutesOf(day.start), hours.timeFormat),
            end: formatClock(minutesOf(day.end), hours.timeFormat),
          })
        : t('closed'),
      today: run.includes(todayWeekday),
    }
  })
}
