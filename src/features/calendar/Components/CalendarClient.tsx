'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useDayFormatter } from './useDayFormatter'
import { CalendarDays, CalendarOff, Plus } from 'lucide-react'
import { useDateSettings } from '@/components/date-settings-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VehiclePickerDialog } from '@/components/vehicle-picker-dialog'
import { BOOKING_SAVED_EVENT } from '@/components/booking-launcher'
import { useIsMobile } from '@/hooks/use-mobile'
import { ReminderFormDialog } from '@/features/vehicles/Components/ReminderFormDialog'
import { NewQuoteDialog } from '@/features/quotes/Components/NewQuoteDialog'
import { ScheduleMessageDialog } from '@/features/scheduled-messages/Components/ScheduleMessageDialog'
import type { MessageChannel } from '@/features/scheduled-messages/Schema/scheduledMessageSchema'
import {
  TimeOffDialog,
  type TechnicianOption,
} from '@/features/workshop-calendar/Components/TimeOffDialog'
import { listAbsences, type AbsenceView } from '@/features/workshop-calendar/Actions/absenceActions'
import { getCalendarEvents } from '../Actions/calendarActions'
import { BookingDialog } from './BookingDialog'
import type { CalendarEvent, CalendarEventType } from '../Actions/calendarActions'
import {
  eachDay,
  getMonthGridDays,
  minutesToTime,
  parseDateKey,
  rangeCovers,
  shiftDate,
  timeToMinutes,
  toLocalDateStr,
  visibleRange,
  type CalendarView,
  type DateRange,
} from '../Lib/calendar-range'
import { compareEvents, isEventDone } from './calendar-utils'
import { CalendarEventList } from './CalendarEventList'
import { CalendarSidebar, typeFiltersFrom } from './CalendarSidebar'
import { CalendarToolbar, type CreateKind } from './CalendarToolbar'
import type { DayActions } from './DayContextMenu'
import { useShortcut } from '@/features/shortcuts/Components/ShortcutsProvider'
import { type BookingEdit, EventPeekProvider, useEventPeek } from './EventPeek'
import { MonthView } from './MonthView'
import { ScheduleView } from './ScheduleView'
import { TimeGridView } from './TimeGridView'
import { type CalendarPreferences, useCalendarPreferences } from './useCalendarPreferences'
import { YearView } from './YearView'

interface CalendarClientProps {
  initialEvents: CalendarEvent[]
  /** The days `initialEvents` covers, as YYYY-MM-DD. */
  initialRange: { start: string; end: string }
  initialView: CalendarView
  /** YYYY-MM-DD the calendar opens on. */
  initialDate: string
  todayStr: string // YYYY-MM-DD computed on server to avoid hydration mismatch
  currencyCode: string
  /** Channels the workshop can actually send on, resolved on the server */
  messageChannels: MessageChannel[]
  /**
   * The technicians this person may set on leave; null when they may not, or
   * the workshop does not track time off.
   */
  timeOff?: { technicians: TechnicianOption[] } | null
  /** The viewing preferences from the cookie; null when none are stored yet. */
  initialPreferences?: CalendarPreferences | null
  /** An appointment a link asked for: its card opens once the day is drawn. */
  openAppointmentId?: string | null
}

const ALL_TYPES: CalendarEventType[] = [
  'service',
  'appointment',
  'reminder',
  'quote',
  'message',
  'external',
  'closure',
  'absence',
]

/** Minutes a work order started from a time slot is booked for. */
const SLOT_WORK_ORDER_MINUTES = 60

/**
 * What to fetch so the view is covered and the neighbouring views usually
 * are too: the whole month grid around the date, widened to whatever the
 * view itself shows, or the whole year for the year view.
 */
function fetchRangeFor(view: CalendarView, date: Date, weekStartDay: number): DateRange {
  const visible = visibleRange(view, date, weekStartDay)
  if (view === 'year') return visible
  const grid = getMonthGridDays(date.getFullYear(), date.getMonth(), weekStartDay)
  return {
    start: grid[0] < visible.start ? grid[0] : visible.start,
    end: grid[grid.length - 1] > visible.end ? grid[grid.length - 1] : visible.end,
  }
}

export default function CalendarClient({
  initialEvents,
  initialRange,
  initialView,
  initialDate,
  todayStr,
  currencyCode,
  messageChannels,
  timeOff = null,
  initialPreferences = null,
  openAppointmentId = null,
}: CalendarClientProps) {
  const t = useTranslations('calendar')
  const tWorkOrders = useTranslations('workOrders.list')
  const format = useDayFormatter()
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { weekStartDay } = useDateSettings()
  const {
    preferences,
    update: updatePreferences,
    setTypeShown,
  } = useCalendarPreferences(initialPreferences)

  const [view, setView] = useState<CalendarView>(initialView)
  const [date, setDate] = useState<Date>(
    () => parseDateKey(initialDate) ?? parseDateKey(todayStr) ?? new Date()
  )
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents)
  const [loadedRange, setLoadedRange] = useState<DateRange | null>(() => {
    const start = parseDateKey(initialRange.start)
    const end = parseDateKey(initialRange.end)
    return start && end ? { start, end } : null
  })
  const [loading, setLoading] = useState(false)
  // Remembered in the browser with the other viewing preferences, so a kind
  // unticked here stays unticked after a trip to the work board or a reload.
  const filters = useMemo(() => typeFiltersFrom(preferences.hiddenTypes), [preferences.hiddenTypes])

  // Dialogs the calendar can open
  const [showPicker, setShowPicker] = useState(false)
  const [showDateChoice, setShowDateChoice] = useState(false)
  const [workOrderQuery, setWorkOrderQuery] = useState<Record<string, string> | undefined>()
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false)
  // An appointment or booked job opened from its peek or menu; null for a new booking.
  const [bookingEdit, setBookingEdit] = useState<BookingEdit | null>(null)
  const [showReminderDialog, setShowReminderDialog] = useState(false)
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [menuDateStr, setMenuDateStr] = useState<string | undefined>(undefined)
  const [menuTime, setMenuTime] = useState<string | undefined>(undefined)
  const [daySheetOpen, setDaySheetOpen] = useState(false)
  /** The leave being added (absence null) or edited, and the day it starts on. */
  const [timeOffEdit, setTimeOffEdit] = useState<{
    date: string
    absence: AbsenceView | null
  } | null>(null)

  const dateStr = toLocalDateStr(date)
  const range = useMemo(() => visibleRange(view, date, weekStartDay), [view, date, weekStartDay])
  const days = useMemo(() => eachDay(range), [range])

  // ── Loading ────────────────────────────────────────────────────────────
  const requestId = useRef(0)
  const load = useCallback(async (target: DateRange) => {
    const id = ++requestId.current
    setLoading(true)
    const result = await getCalendarEvents({
      start: toLocalDateStr(target.start),
      end: toLocalDateStr(target.end),
    })
    // A slower earlier request must not overwrite a newer one.
    if (id !== requestId.current) return
    if (result.success && result.data) {
      setEvents(result.data)
      setLoadedRange(target)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (rangeCovers(loadedRange, range)) return
    load(fetchRangeFor(view, date, weekStartDay))
  }, [range, loadedRange, load, view, date, weekStartDay])

  const refresh = useCallback(() => {
    load(loadedRange ?? fetchRangeFor(view, date, weekStartDay))
  }, [load, loadedRange, view, date, weekStartDay])

  // A booking made from the header while the calendar is open: the events
  // here are the calendar's own, so they are read again.
  useEffect(() => {
    document.addEventListener(BOOKING_SAVED_EVENT, refresh)
    return () => document.removeEventListener(BOOKING_SAVED_EVENT, refresh)
  }, [refresh])

  // ── URL ────────────────────────────────────────────────────────────────
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const params = new URLSearchParams()
    params.set('view', view)
    params.set('date', dateStr)
    // Native replaceState rather than router.replace: the Next router folds
    // it into its own history, and no server render is asked for. Flicking
    // through months would otherwise re-run the whole page on the server.
    window.history.replaceState(window.history.state, '', `${pathname}?${params.toString()}`)
  }, [view, dateStr, pathname])

  // ── Derived data ───────────────────────────────────────────────────────
  const counts = useMemo(() => {
    const c: Record<CalendarEventType, number> = {
      service: 0,
      appointment: 0,
      reminder: 0,
      quote: 0,
      message: 0,
      external: 0,
      closure: 0,
      absence: 0,
    }
    const startKey = toLocalDateStr(range.start)
    const endKey = toLocalDateStr(range.end)
    for (const e of events) {
      if (e.date >= startKey && e.date <= endKey) c[e.type]++
    }
    return c
  }, [events, range])
  const total = ALL_TYPES.reduce((sum, type) => sum + counts[type], 0)

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!filters[e.type]) continue
      if (
        !preferences.showCompleted &&
        (e.type === 'service' || e.type === 'reminder') &&
        isEventDone(e)
      ) {
        continue
      }
      const list = map.get(e.date)
      if (list) list.push(e)
      else map.set(e.date, [e])
    }
    for (const list of map.values()) list.sort(compareEvents)
    return map
  }, [events, filters, preferences.showCompleted])

  const busyDates = useMemo(
    () =>
      Array.from(eventsByDate.keys())
        .map(parseDateKey)
        .filter((d): d is Date => d !== null),
    [eventsByDate]
  )

  const title = useMemo(() => {
    switch (view) {
      case 'day':
        return format.dateTime(date, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      case 'week':
      case 'fourDays': {
        // Composed by hand rather than with a range formatter: ICU versions
        // disagree on the spaces around the dash, and the server's text
        // would not match the browser's.
        const sameYear = range.start.getFullYear() === range.end.getFullYear()
        const day = { day: 'numeric', month: 'short' } as const
        const start = format.dateTime(range.start, sameYear ? day : { ...day, year: 'numeric' })
        const end = format.dateTime(range.end, { ...day, year: 'numeric' })
        return `${start} – ${end}`
      }
      case 'year':
        return String(date.getFullYear())
      default:
        return format.dateTime(date, { month: 'long', year: 'numeric' })
    }
  }, [view, date, range, format])

  // ── Navigation ─────────────────────────────────────────────────────────
  const goPrev = useCallback(() => setDate((d) => shiftDate(view, d, -1)), [view])
  const goNext = useCallback(() => setDate((d) => shiftDate(view, d, 1)), [view])
  const goToday = useCallback(() => setDate(parseDateKey(todayStr) ?? new Date()), [todayStr])

  const selectDate = useCallback(
    (d: Date) => {
      setDate(d)
      if (isMobile && (view === 'month' || view === 'year')) setDaySheetOpen(true)
    },
    [isMobile, view]
  )
  const openDay = useCallback((d: Date) => {
    setDate(d)
    setView('day')
  }, [])

  // The calendar's keys. Which key does what, and whether it may fire (not
  // while typing, not over a dialog), is the shortcut registry's business.
  useShortcut('calendar.day', () => setView('day'))
  useShortcut('calendar.week', () => setView('week'))
  useShortcut('calendar.month', () => setView('month'))
  useShortcut('calendar.year', () => setView('year'))
  useShortcut('calendar.schedule', () => setView('schedule'))
  useShortcut('calendar.fourDays', () => setView('fourDays'))
  useShortcut('calendar.today', goToday)
  useShortcut('calendar.next', goNext)
  useShortcut('calendar.previous', goPrev)

  // ── Creating things ────────────────────────────────────────────────────
  const openWorkOrderPicker = useCallback((query?: Record<string, string>) => {
    setWorkOrderQuery(query)
    setShowPicker(true)
  }, [])

  const handleCreate = useCallback(
    (kind: CreateKind) => {
      setMenuDateStr(dateStr)
      setMenuTime(undefined)
      switch (kind) {
        case 'workOrder':
          // A day other than today is probably what the person means, but
          // it might not be: ask, as the old button did.
          if (dateStr !== todayStr) setShowDateChoice(true)
          else openWorkOrderPicker(undefined)
          break
        case 'appointment':
          setShowAppointmentDialog(true)
          break
        case 'reminder':
          setShowReminderDialog(true)
          break
        case 'quote':
          setShowQuoteDialog(true)
          break
        case 'message':
          setShowMessageDialog(true)
          break
        case 'timeOff':
          setTimeOffEdit({ date: dateStr, absence: null })
          break
      }
    },
    [dateStr, todayStr, openWorkOrderPicker]
  )

  const handleDateChoice = useCallback(
    (useSelectedDate: boolean) => {
      setShowDateChoice(false)
      openWorkOrderPicker(useSelectedDate ? { boardDate: dateStr } : undefined)
    },
    [dateStr, openWorkOrderPicker]
  )

  const dayActions = useMemo<DayActions>(
    () => ({
      onNewWorkOrder: (day, time) => {
        if (!time) {
          openWorkOrderPicker({ boardDate: day })
          return
        }
        const startMins = timeToMinutes(time)
        openWorkOrderPicker({
          boardDate: day,
          boardStart: time,
          boardEnd: minutesToTime(Math.min(startMins + SLOT_WORK_ORDER_MINUTES, 24 * 60 - 1)),
        })
      },
      onBookAppointment: (day, time) => {
        setMenuDateStr(day)
        setMenuTime(time)
        setShowAppointmentDialog(true)
      },
      onNewReminder: (day, time) => {
        setMenuDateStr(day)
        setMenuTime(time)
        setShowReminderDialog(true)
      },
      onNewQuote: (day) => {
        setMenuDateStr(day)
        setShowQuoteDialog(true)
      },
      onScheduleMessage: (day, time) => {
        setMenuDateStr(day)
        setMenuTime(time)
        setShowMessageDialog(true)
      },
      onTimeOff: timeOff ? (day) => setTimeOffEdit({ date: day, absence: null }) : undefined,
    }),
    [openWorkOrderPicker, timeOff]
  )

  /** A leave entry is one row a day; its id carries the stretch it belongs to. */
  const editAbsence = useCallback(
    async (event: CalendarEvent) => {
      const id = event.id.split(':')[1]
      const res = await listAbsences({ from: event.date })
      const absence = res.success ? res.data?.find((a) => a.id === id) : undefined
      if (!absence) {
        toast.error(res.error ?? t('timeOffMissing'))
        refresh()
        return
      }
      setTimeOffEdit({ date: absence.startDate, absence })
    },
    [refresh, t]
  )

  // Noon parse, so the seeded day survives any timezone the workshop sits in.
  // Memoised because the reminder dialog re-seeds whenever this value changes.
  const menuDate = useMemo(
    () => (menuDateStr ? new Date(`${menuDateStr}T12:00:00`) : undefined),
    [menuDateStr]
  )

  const monthDays = useMemo(
    () => getMonthGridDays(date.getFullYear(), date.getMonth(), weekStartDay),
    [date, weekStartDay]
  )

  // A fresh workshop opening the calendar saw a blank month grid and nothing
  // else. The schedule view already says "nothing scheduled" and why; the
  // month view floats the same note over its grid, with the one thing that
  // would put something on it. The days underneath stay clickable.
  const monthIsEmpty =
    view === 'month' &&
    monthDays.every((d) => (eventsByDate.get(toLocalDateStr(d))?.length ?? 0) === 0)

  const body = (() => {
    switch (view) {
      case 'month':
        return (
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <MonthView
              days={monthDays}
              month={date.getMonth()}
              eventsByDate={eventsByDate}
              todayStr={todayStr}
              selectedDateStr={dateStr}
              showWeekends={preferences.showWeekends}
              showWeekNumbers={preferences.showWeekNumbers}
              actions={dayActions}
              onSelectDate={selectDate}
              onOpenDay={openDay}
            />
            {monthIsEmpty && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                <div className="glass pointer-events-auto flex max-w-xs flex-col items-center gap-2 rounded-xl px-6 py-5 text-center shadow-xl">
                  <CalendarOff className="h-8 w-8 text-muted-foreground/60" />
                  <p className="text-sm font-medium">{t('schedule.empty')}</p>
                  <p className="text-xs text-muted-foreground">{t('schedule.emptyHint')}</p>
                  <Button size="sm" className="mt-1" onClick={() => handleCreate('workOrder')}>
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {tWorkOrders('newWorkOrder')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      case 'year':
        return (
          <YearView
            year={date.getFullYear()}
            eventsByDate={eventsByDate}
            todayStr={todayStr}
            selectedDateStr={dateStr}
            onSelectDate={selectDate}
            onOpenDay={openDay}
          />
        )
      case 'schedule':
        return (
          <ScheduleView
            days={days}
            eventsByDate={eventsByDate}
            todayStr={todayStr}
            onSelectDate={openDay}
          />
        )
      default:
        return (
          <TimeGridView
            key={view}
            days={days}
            eventsByDate={eventsByDate}
            todayStr={todayStr}
            selectedDateStr={dateStr}
            showWeekends={preferences.showWeekends}
            actions={dayActions}
            onSelectDate={setDate}
            onOpenDay={openDay}
          />
        )
    }
  })()

  return (
    <EventPeekProvider
      currencyCode={currencyCode}
      onRefresh={refresh}
      onEditAbsence={timeOff ? editAbsence : undefined}
      onEditBooking={(edit) => {
        setBookingEdit(edit)
        setShowAppointmentDialog(true)
      }}
    >
      {/*
        A definite height, not flex-1: nothing above this in the layout has
        one (the shell is min-h-svh), so a flexed calendar would grow to the
        full 24-hour grid and hand scrolling to the page. The subtraction is
        the header (4rem), the page padding (1rem) and, on phones, the
        bottom nav (3.5rem). Short screens fall back to a page that scrolls.
      */}
      <div className="flex h-[calc(100svh-8.5rem)] min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-lg border border-card-edge bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)] md:h-[calc(100svh-5rem)]">
        <CalendarToolbar
          title={title}
          view={view}
          loading={loading}
          sidebarOpen={preferences.sidebarOpen}
          preferences={preferences}
          onViewChange={setView}
          onPrev={goPrev}
          onNext={goNext}
          onToday={goToday}
          onToggleSidebar={() => updatePreferences({ sidebarOpen: !preferences.sidebarOpen })}
          onPreferenceChange={updatePreferences}
          onCreate={handleCreate}
          canSetTimeOff={timeOff !== null}
          filters={filters}
          counts={counts}
          onFilterChange={setTypeShown}
        />
        <div className="flex min-h-0 flex-1">
          {preferences.sidebarOpen && (
            <CalendarSidebar
              selectedDate={date}
              month={date}
              busyDates={busyDates}
              filters={filters}
              counts={counts}
              total={total}
              onSelectDate={selectDate}
              onMonthChange={(m) => {
                // Moving the mini calendar moves the main view with it, but a
                // month that already holds the date is left alone.
                if (m.getFullYear() !== date.getFullYear() || m.getMonth() !== date.getMonth()) {
                  setDate(new Date(m.getFullYear(), m.getMonth(), 1))
                }
              }}
              onFilterChange={setTypeShown}
            />
          )}
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            {body}
            {openAppointmentId && (
              <LinkedAppointment
                event={initialEvents.find(
                  (e) => e.type === 'appointment' && e.id === openAppointmentId
                )}
              />
            )}
          </div>
        </div>
      </div>

      <Sheet open={daySheetOpen} onOpenChange={setDaySheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] overflow-y-auto"
          aria-describedby={undefined}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{format.dateTime(date, { dateStyle: 'full' })}</SheetTitle>
          </SheetHeader>
          <CalendarEventList events={eventsByDate.get(dateStr) ?? []} selectedDate={date} />
          <div className="mt-3 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setDaySheetOpen(false)
                openDay(date)
              }}
            >
              {t('openDay', { date: format.dateTime(date, { day: 'numeric', month: 'short' }) })}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showDateChoice} onOpenChange={setShowDateChoice}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{t('dateChoice.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('dateChoice.description', {
              selectedDate: format.dateTime(date, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            })}
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={() => handleDateChoice(true)}>
              <CalendarDays className="mr-2 h-4 w-4" />
              {t('dateChoice.useSelected', {
                date: format.dateTime(date, { month: 'short', day: 'numeric' }),
              })}
            </Button>
            <Button variant="outline" onClick={() => handleDateChoice(false)}>
              {t('dateChoice.useToday')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <BookingDialog
        open={showAppointmentDialog}
        onOpenChange={(open) => {
          setShowAppointmentDialog(open)
          if (!open) setBookingEdit(null)
        }}
        defaultDate={menuDateStr}
        defaultTime={menuTime}
        edit={bookingEdit}
        onSaved={refresh}
      />

      <ReminderFormDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        defaultDueDate={menuDate}
        defaultDueTime={menuTime}
        onSaved={refresh}
      />

      <NewQuoteDialog
        open={showQuoteDialog}
        onOpenChange={setShowQuoteDialog}
        defaultValidUntil={menuDateStr}
      />

      <ScheduleMessageDialog
        open={showMessageDialog}
        onOpenChange={setShowMessageDialog}
        availableChannels={messageChannels}
        defaultDate={menuDateStr}
        defaultTime={menuTime}
        onSaved={refresh}
      />

      <VehiclePickerDialog
        open={showPicker}
        onOpenChange={setShowPicker}
        title={t('selectVehicle')}
        redirectQuery={workOrderQuery}
      />
      {timeOff && (
        <TimeOffDialog
          open={timeOffEdit !== null}
          onOpenChange={(open) => {
            if (!open) setTimeOffEdit(null)
          }}
          absence={timeOffEdit?.absence ?? null}
          technicians={timeOff.technicians}
          defaultDate={timeOffEdit?.date ?? dateStr}
          onSaved={refresh}
        />
      )}
    </EventPeekProvider>
  )
}

/**
 * Opens the card of the appointment a link asked for, once. The card is
 * anchored to a point near the top of the view rather than to the chip,
 * which knows nothing of links; closing it leaves the day on screen.
 */
function LinkedAppointment({ event }: { event: CalendarEvent | undefined }) {
  const { openPeek } = useEventPeek()
  const anchor = useRef<HTMLSpanElement>(null)
  const opened = useRef(false)
  useEffect(() => {
    if (opened.current || !event || !anchor.current) return
    opened.current = true
    openPeek(event, anchor.current)
  }, [event, openPeek])
  return (
    <span
      ref={anchor}
      aria-hidden
      className="pointer-events-none absolute top-16 left-1/2 h-0 w-0"
    />
  )
}
