'use client'

import { Clock } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { AppCard } from '@/components/app-card'
import { cn } from '@/lib/utils'
import { formatClock } from '@/features/workboard/utils/clock'
import { formatDay, weekdayName } from '@/features/workshop-calendar/Lib/format'
import { weekdayOf } from '@/features/workshop-calendar/Lib/calendar'
import type { PortalOpeningHours as Hours } from '../Actions/portalActions'

/** Monday first: how most of the world reads a week of opening hours. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * When the workshop is open, for its customers: each weekday's hours with
 * today marked, then the days soon it is shut or closes early. `wide` lays
 * the week out in a row on wider screens, for a card that spans the page.
 */
export function PortalOpeningHours({ hours, wide = false }: { hours: Hours; wide?: boolean }) {
  const t = useTranslations('portal.openingHours')
  const locale = useLocale()
  const todayWeekday = weekdayOf(hours.today)
  const span = (start: string, end: string) =>
    `${formatClock(minutesOf(start), hours.timeFormat)} – ${formatClock(minutesOf(end), hours.timeFormat)}`

  return (
    <AppCard icon={Clock} title={t('title')}>
      <ul
        className={cn(
          'space-y-1 text-sm',
          // A list on a phone; a row of days once there is room for one.
          wide && 'sm:grid sm:grid-cols-4 sm:gap-2 sm:space-y-0 lg:grid-cols-7'
        )}
        data-testid="portal-opening-hours"
      >
        {WEEK_ORDER.map((weekday) => {
          const day = hours.week[weekday]
          const isToday = weekday === todayWeekday
          return (
            <li
              key={weekday}
              className={cn(
                'flex justify-between gap-3 rounded-md px-2 py-1',
                wide && 'sm:flex-col sm:justify-start sm:gap-0.5 sm:border',
                isToday && 'bg-muted font-medium'
              )}
              aria-current={isToday ? 'date' : undefined}
            >
              <span>
                {weekdayName(weekday, locale)}
                {isToday && <span className="sr-only"> ({t('today')})</span>}
              </span>
              <span className={cn('tabular-nums', !day?.open && 'text-muted-foreground')}>
                {day?.open ? span(day.start, day.end) : t('closed')}
              </span>
            </li>
          )
        })}
      </ul>

      {hours.closedSoon.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('closedSoon')}
          </p>
          <ul className="space-y-1 text-sm" data-testid="portal-closed-soon">
            {hours.closedSoon.map((day) => (
              <li key={day.date} className="flex flex-wrap justify-between gap-x-3">
                <span>
                  {formatDay(day.date, locale, { year: false, weekday: true })}
                  <span className="text-muted-foreground"> · {day.name}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
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
    </AppCard>
  )
}
