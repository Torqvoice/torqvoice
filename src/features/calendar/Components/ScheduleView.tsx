'use client'

import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import { CalendarOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toLocalDateStr } from '../Lib/calendar-range'
import { EventChip } from './EventChip'
import { eventKey } from './calendar-utils'
import type { CalendarEvent } from '../Actions/calendarActions'

interface ScheduleViewProps {
  days: Date[]
  eventsByDate: Map<string, CalendarEvent[]>
  todayStr: string
  onSelectDate: (date: Date) => void
  /** Classes for the list itself; the calendar centres it, a card fills its width. */
  listClassName?: string
}

/**
 * The agenda: every day in the range that has something on it, as a list.
 * Reads top to bottom like a schedule printout, which is what a service
 * desk wants when planning the coming weeks.
 */
export function ScheduleView({
  days,
  eventsByDate,
  todayStr,
  onSelectDate,
  listClassName,
}: ScheduleViewProps) {
  const t = useTranslations('calendar')
  const format = useDayFormatter()
  const busyDays = days.filter((d) => (eventsByDate.get(toLocalDateStr(d))?.length ?? 0) > 0)

  if (busyDays.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <CalendarOff className="h-8 w-8 text-muted-foreground/60" />
        <p className="text-sm font-medium">{t('schedule.empty')}</p>
        <p className="text-xs text-muted-foreground">{t('schedule.emptyHint')}</p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={cn('mx-auto max-w-4xl divide-y divide-border/70', listClassName)}>
        {busyDays.map((date) => {
          const dateStr = toLocalDateStr(date)
          const events = eventsByDate.get(dateStr) ?? []
          const isToday = dateStr === todayStr
          return (
            <section key={dateStr} className="flex gap-2 px-3 py-3 sm:gap-4 sm:px-4">
              <button
                type="button"
                onClick={() => onSelectDate(date)}
                className="flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-md text-left hover:bg-accent sm:w-24 sm:flex-row sm:items-start sm:gap-2"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg font-semibold tabular-nums',
                    isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {date.getDate()}
                </span>
                <span className="flex flex-col items-center pt-0.5 text-[11px] uppercase leading-tight tracking-wide text-muted-foreground sm:items-start">
                  <span className={cn(isToday && 'text-primary')}>
                    {format.dateTime(date, { weekday: 'short' })}
                  </span>
                  <span className="hidden sm:inline">
                    {format.dateTime(date, { month: 'short' })}
                  </span>
                </span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {events.map((event) => (
                  <EventChip key={eventKey(event)} event={event} variant="row" />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
