'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import { CalendarDays } from 'lucide-react'
import { useDateSettings } from '@/components/date-settings-context'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { VehiclePickerDialog } from '@/components/vehicle-picker-dialog'
import { useIsMobile } from '@/hooks/use-mobile'
import { ReminderFormDialog } from '@/features/vehicles/Components/ReminderFormDialog'
import { NewQuoteDialog } from '@/features/quotes/Components/NewQuoteDialog'
import { ScheduleMessageDialog } from '@/features/scheduled-messages/Components/ScheduleMessageDialog'
import type { MessageChannel } from '@/features/scheduled-messages/Schema/scheduledMessageSchema'
import { getCalendarEvents } from '../Actions/calendarActions'
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
import { CalendarSidebar, type TypeFilters } from './CalendarSidebar'
import { CalendarToolbar, VIEW_SHORTCUTS, type CreateKind } from './CalendarToolbar'
import type { DayActions } from './DayContextMenu'
import { EventPeekProvider } from './EventPeek'
import { MonthView } from './MonthView'
import { ScheduleView } from './ScheduleView'
import { TimeGridView } from './TimeGridView'
import { useCalendarPreferences } from './useCalendarPreferences'
import { YearView } from './YearView'

interface Vehicle {
  id: string
  make: string
  model: string
  year: number
  licensePlate: string | null
  customer: { id: string; name: string; company: string | null } | null
}

interface Customer {
  id: string
  name: string
  company: string | null
}

interface CalendarClientProps {
  initialEvents: CalendarEvent[]
  /** The days `initialEvents` covers, as YYYY-MM-DD. */
  initialRange: { start: string; end: string }
  initialView: CalendarView
  /** YYYY-MM-DD the calendar opens on. */
  initialDate: string
  todayStr: string // YYYY-MM-DD computed on server to avoid hydration mismatch
  vehicles: Vehicle[]
  customers: Customer[]
  currencyCode: string
  /** Channels the workshop can actually send on, resolved on the server */
  messageChannels: MessageChannel[]
}

const ALL_TYPES: CalendarEventType[] = ['service', 'reminder', 'quote', 'message', 'external']

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
  vehicles,
  customers,
  currencyCode,
  messageChannels,
}: CalendarClientProps) {
  const t = useTranslations('calendar')
  const format = useDayFormatter()
  const pathname = usePathname()
  const isMobile = useIsMobile()
  const { weekStartDay } = useDateSettings()
  const { preferences, update: updatePreferences } = useCalendarPreferences()

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
  const [filters, setFilters] = useState<TypeFilters>({
    service: true,
    reminder: true,
    quote: true,
    message: true,
    external: true,
  })

  // Dialogs the calendar can open
  const [showPicker, setShowPicker] = useState(false)
  const [showDateChoice, setShowDateChoice] = useState(false)
  const [workOrderQuery, setWorkOrderQuery] = useState<Record<string, string> | undefined>()
  const [showReminderDialog, setShowReminderDialog] = useState(false)
  const [showQuoteDialog, setShowQuoteDialog] = useState(false)
  const [showMessageDialog, setShowMessageDialog] = useState(false)
  const [menuDateStr, setMenuDateStr] = useState<string | undefined>(undefined)
  const [menuTime, setMenuTime] = useState<string | undefined>(undefined)
  const [daySheetOpen, setDaySheetOpen] = useState(false)

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
      reminder: 0,
      quote: 0,
      message: 0,
      external: 0,
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]'
        )
      ) {
        return
      }
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
      const viewFor = (Object.keys(VIEW_SHORTCUTS) as CalendarView[]).find(
        (v) => VIEW_SHORTCUTS[v] === key
      )
      if (viewFor) {
        setView(viewFor)
        return
      }
      switch (key) {
        case 'T':
          goToday()
          break
        case 'J':
        case 'N':
        case 'ArrowRight':
          goNext()
          break
        case 'K':
        case 'P':
        case 'ArrowLeft':
          goPrev()
          break
        default:
          return
      }
      e.preventDefault()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [goToday, goNext, goPrev])

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
        case 'reminder':
          setShowReminderDialog(true)
          break
        case 'quote':
          setShowQuoteDialog(true)
          break
        case 'message':
          setShowMessageDialog(true)
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
    }),
    [openWorkOrderPicker]
  )

  // Noon parse, so the seeded day survives any timezone the workshop sits in.
  // Memoised because the reminder dialog re-seeds whenever this value changes.
  const menuDate = useMemo(
    () => (menuDateStr ? new Date(`${menuDateStr}T12:00:00`) : undefined),
    [menuDateStr]
  )

  // The reminder dialog picks vehicles from a flat list with the customer inlined
  const reminderVehicles = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id,
        make: v.make,
        model: v.model,
        year: v.year,
        licensePlate: v.licensePlate,
        customerName: v.customer?.name ?? null,
        customerId: v.customer?.id ?? null,
      })),
    [vehicles]
  )

  const monthDays = useMemo(
    () => getMonthGridDays(date.getFullYear(), date.getMonth(), weekStartDay),
    [date, weekStartDay]
  )

  const body = (() => {
    switch (view) {
      case 'month':
        return (
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
    <EventPeekProvider currencyCode={currencyCode} onRefresh={refresh}>
      {/*
        A definite height, not flex-1: nothing above this in the layout has
        one (the shell is min-h-svh), so a flexed calendar would grow to the
        full 24-hour grid and hand scrolling to the page. The subtraction is
        the header (4rem), the page padding (1rem) and, on phones, the
        bottom nav (3.5rem). Short screens fall back to a page that scrolls.
      */}
      <div className="flex h-[calc(100svh-8.5rem)] min-h-[32rem] min-w-0 flex-col overflow-hidden rounded-xl border border-card-edge bg-card text-card-foreground shadow-[0_1px_2px_rgb(0_0_0/0.05),0_12px_32px_-16px_rgb(0_0_0/0.18)] md:h-[calc(100svh-5rem)]">
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
              onFilterChange={(type, checked) =>
                setFilters((current) => ({ ...current, [type]: checked }))
              }
            />
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{body}</div>
        </div>
      </div>

      <Sheet open={daySheetOpen} onOpenChange={setDaySheetOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
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
        <DialogContent className="max-w-sm">
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

      <ReminderFormDialog
        open={showReminderDialog}
        onOpenChange={setShowReminderDialog}
        vehicles={reminderVehicles}
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
        vehicles={vehicles}
        customers={customers}
        title={t('selectVehicle')}
        redirectQuery={workOrderQuery}
      />
    </EventPeekProvider>
  )
}
