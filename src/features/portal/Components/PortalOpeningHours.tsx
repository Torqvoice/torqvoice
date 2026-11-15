'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatClock } from '@/features/workboard/utils/clock'
import { weekdayOf } from '@/features/workshop-calendar/Lib/calendar'
import { formatDay, weekdayName } from '@/features/workshop-calendar/Lib/format'
import type { PortalOpeningHours as Hours } from '../Actions/portalActions'
import { PortalPanel, PortalSectionLabel } from './Ui'

/** Monday first: how most of the world reads a week of opening hours. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * When the workshop is open, for its customers: each weekday's hours with
 * today marked, then the days soon it is shut or closes early. Drawn in the
 * portal theme's panel, beside the form a customer picks a day in.
 */
export function PortalOpeningHours({ hours }: { hours: Hours }) {
  const t = useTranslations('portal.openingHours')
  const locale = useLocale()
  const todayWeekday = weekdayOf(hours.today)
  const span = (start: string, end: string) =>
    `${formatClock(minutesOf(start), hours.timeFormat)} – ${formatClock(minutesOf(end), hours.timeFormat)}`

  return (
    <PortalPanel aria-labelledby="portal-hours-title">
      <PortalSectionLabel id="portal-hours-title">{t('title')}</PortalSectionLabel>
      <ul className="mt-3 flex flex-col text-[15px]" data-testid="portal-opening-hours">
        {WEEK_ORDER.map((weekday) => {
          const day = hours.week[weekday]
          const isToday = weekday === todayWeekday
          return (
            <li
              key={weekday}
              className={[
                '-mx-2 flex justify-between gap-3 rounded-[8px] px-2 py-1.5',
                isToday ? 'bg-[var(--p-soft)] font-semibold' : '',
              ].join(' ')}
              aria-current={isToday ? 'date' : undefined}
            >
              <span>
                {weekdayName(weekday, locale)}
                {isToday && <span className="sr-only"> ({t('today')})</span>}
              </span>
              <span className={day?.open ? undefined : 'p-muted'}>
                {day?.open ? span(day.start, day.end) : t('closed')}
              </span>
            </li>
          )
        })}
      </ul>

      {hours.closedSoon.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <p className="p-muted text-sm font-semibold">{t('closedSoon')}</p>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm" data-testid="portal-closed-soon">
            {hours.closedSoon.map((day) => (
              <li key={day.date} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  {formatDay(day.date, locale, { year: false, weekday: true })}
                  <span className="p-muted"> · {day.name}</span>
                </span>
                <span className="p-muted">
                  {day.open.length === 0
                    ? t('closed')
                    : t('openOnly', {
                        hours: day.open.map((o) => span(o.start, o.end)).join(', '),
                      })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PortalPanel>
  )
}
