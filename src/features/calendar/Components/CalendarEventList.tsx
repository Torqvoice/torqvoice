'use client'

import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import { EventChip } from './EventChip'
import { eventKey } from './calendar-utils'
import type { CalendarEvent } from '../Actions/calendarActions'

interface CalendarEventListProps {
  /** Already filtered and sorted for the day. */
  events: CalendarEvent[]
  selectedDate: Date
}

/**
 * One day as a plain list. The desktop views peek at events in place; this
 * is what a phone shows in a sheet when a day is tapped.
 */
export function CalendarEventList({ events, selectedDate }: CalendarEventListProps) {
  const t = useTranslations('calendar')
  const format = useDayFormatter()

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">
        {format.dateTime(selectedDate, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </p>
      {events.length === 0 ? (
        <div className="py-8 text-center">
          <p className="mb-1 text-sm text-muted-foreground">{t('events.noEvents')}</p>
          <p className="text-xs text-muted-foreground">{t('events.selectDay')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {events.map((event) => (
            <EventChip key={eventKey(event)} event={event} variant="row" />
          ))}
        </div>
      )}
    </div>
  )
}
