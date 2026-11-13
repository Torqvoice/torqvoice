'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRight, CalendarDays, Plus } from 'lucide-react'
import { AppCard } from '@/components/app-card'
import { CardEmpty } from '@/components/card-empty'
import { Button } from '@/components/ui/button'
import { addDays, parseDateKey, toLocalDateStr } from '../Lib/calendar-range'
import { BookAppointmentDialog } from './BookAppointmentDialog'
import { compareEvents, isEventDone } from './calendar-utils'
import { EventPeekProvider } from './EventPeek'
import { ScheduleView } from './ScheduleView'
import type { CalendarEvent } from '../Actions/calendarActions'

/**
 * The dashboard's look at the calendar: what is on today and the days after
 * it, drawn the way the calendar's own schedule view draws it, and opened
 * the same way, with the peek card on a click and the event menu on a
 * right-click. What is already done is left out; this is what is coming.
 *
 * The events arrive already cut to what this person may read: the calendar
 * feed leaves out the kinds of record their role cannot open.
 */
export function CalendarEventsCard({
  events,
  todayKey,
  days,
  currencyCode,
}: {
  events: CalendarEvent[]
  /** YYYY-MM-DD, today in the workshop's time zone. */
  todayKey: string
  /** How many days from today the events cover, today included. */
  days: number
  currencyCode: string
}) {
  const t = useTranslations('dashboard')
  const tCalendar = useTranslations('calendar')
  const router = useRouter()
  const [booking, setBooking] = useState(false)
  const refresh = useCallback(() => router.refresh(), [router])

  const upcoming = useMemo(() => events.filter((event) => !isEventDone(event)), [events])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of upcoming) {
      const list = map.get(event.date)
      if (list) list.push(event)
      else map.set(event.date, [event])
    }
    for (const list of map.values()) list.sort(compareEvents)
    return map
  }, [upcoming])

  // Local-midnight dates built from the day keys, the same way on the server
  // and in the browser, which is what ScheduleView formats.
  const dayDates = useMemo(() => {
    const first = parseDateKey(todayKey)
    return first ? Array.from({ length: days }, (_, i) => addDays(first, i)) : []
  }, [todayKey, days])

  const bookButton = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 gap-1.5 text-xs"
      onClick={() => setBooking(true)}
    >
      <Plus className="h-3.5 w-3.5" />
      {tCalendar('contextMenu.bookAppointment')}
    </Button>
  )

  return (
    <EventPeekProvider currencyCode={currencyCode} onRefresh={refresh}>
      <AppCard
        icon={CalendarDays}
        title={t('calendarEvents.title')}
        description={t('calendarEvents.description', { days })}
        badge={upcoming.length || undefined}
        action={upcoming.length === 0 ? undefined : bookButton}
        contentClassName="p-0"
        footer={
          upcoming.length === 0 ? undefined : (
            <button
              type="button"
              onClick={() => router.push('/calendar?view=schedule')}
              className="flex w-full items-center justify-between font-medium transition-colors hover:text-foreground"
            >
              {t('viewAll')}
              <ArrowRight className="h-3 w-3" />
            </button>
          )
        }
      >
        {upcoming.length === 0 ? (
          <CardEmpty
            icon={CalendarDays}
            title={t('calendarEvents.noData', { days })}
            action={bookButton}
          />
        ) : (
          <ScheduleView
            days={dayDates}
            eventsByDate={eventsByDate}
            todayStr={todayKey}
            onSelectDate={(date) => router.push(`/calendar?view=day&date=${toLocalDateStr(date)}`)}
            listClassName="mx-0 max-w-none"
          />
        )}
      </AppCard>
      <BookAppointmentDialog
        open={booking}
        onOpenChange={setBooking}
        defaultDate={todayKey}
        onBooked={refresh}
      />
    </EventPeekProvider>
  )
}
