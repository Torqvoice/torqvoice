'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { DndContext } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Wrench, ClipboardCheck, Wifi, WifiOff } from 'lucide-react'
import { useWorkBoardStore, type Technician } from '../store/workboardStore'
import { useWorkBoardWebSocket } from '../hooks/useWorkBoardWebSocket'
import type { WorkBay, WorkBoardJob } from '../Actions/boardActions'
import { getBoardJobs } from '../Actions/boardActions'
import { getTechnicians } from '../Actions/technicianActions'
import { getWorkBays } from '../Actions/workBayActions'
import { PresenterKanbanView } from './PresenterKanbanView'
import { WeekTimeline } from './WeekTimeline'
import { WeekCardGrid } from './WeekCardGrid'
import { type BoardLayout, isBoardLayout } from '../hooks/useBoardPreferences'
import { type ClockFormat } from '../utils/clock'
import { type LaneGrouping, buildLanes, groupJobsByLane, isLaneGrouping } from '../utils/lanes'
import { useTranslations, useLocale } from 'next-intl'
import { useDateSettings } from '@/components/date-settings-context'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Period = 'day' | 'week'
/** Timeline and Overview are the board's own layouts; Status is the kanban,
 *  which only makes sense for a single day. */
type PresenterLayout = BoardLayout | 'status'

/** Older pinned displays carry ?view=; keep those URLs working. */
const LEGACY_VIEWS: Record<string, { period: Period; layout: PresenterLayout }> = {
  timeline: { period: 'day', layout: 'timeline' },
  day: { period: 'day', layout: 'cards' },
  status: { period: 'day', layout: 'status' },
  week: { period: 'week', layout: 'timeline' },
}

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekStart(date: Date, weekStartDay: number): string {
  const d = new Date(date)
  const diff = (d.getDay() - weekStartDay + 7) % 7
  d.setDate(d.getDate() - diff)
  return toLocalDateString(d)
}

function getWeekDays(weekStart: string): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + i)
    days.push(toLocalDateString(d))
  }
  return days
}

/** The presenter shows the board; it never changes it. */
const noop = () => undefined

function formatWeekRange(weekStart: string, locale?: string): string {
  const start = new Date(weekStart + 'T12:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(locale, opts)} – ${end.toLocaleDateString(locale, { ...opts, year: 'numeric' })}`
}

function formatDayDate(dateStr: string, locale?: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * The wall clock in the header.
 *
 * Rendered null until the first tick, because the server has no idea what time
 * it is where the screen is and a mismatched first paint is a hydration error.
 * That left a one-space-wide element that jumped to full width a moment later,
 * shoving the header about, so the space is reserved up front: tabular figures
 * and a width sized for the longest the format can be.
 */
function LiveClock({ format }: { format: ClockFormat }) {
  const [time, setTime] = useState<string | null>(null)

  useEffect(() => {
    function update() {
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: format === '12h',
        })
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [format])

  return (
    <span
      className="inline-block text-right tabular-nums"
      // "11:59:59 PM" against "23:59:59": reserve for whichever is in use.
      style={{ minWidth: format === '12h' ? '10ch' : '8ch' }}
    >
      {time ?? '\u00A0'}
    </span>
  )
}

export function WorkBoardPresenter({
  initialTechnicians,
  initialWorkBays = [],
  initialAssignments,
  initialWeekStart,
  workDayStart = '07:00',
  workDayEnd = '15:00',
  weekStartDay = 1,
}: {
  initialTechnicians: Technician[]
  initialWorkBays?: WorkBay[]
  initialAssignments: WorkBoardJob[]
  initialWeekStart: string
  workDayStart?: string
  workDayEnd?: string
  weekStartDay?: number
}) {
  const store = useWorkBoardStore()
  const t = useTranslations('workBoard.presenter')
  const tb = useTranslations('workBoard.board')
  const tt = useTranslations('workBoard.toolbar')
  const { timeFormat } = useDateSettings()
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const legacy = LEGACY_VIEWS[searchParams.get('view') ?? '']
  const urlPeriod = searchParams.get('period')
  const urlLayout = searchParams.get('layout')
  const urlDate = searchParams.get('date')
  const urlGrouping = searchParams.get('group')

  const [period, setPeriodState] = useState<Period>(
    urlPeriod === 'day' || urlPeriod === 'week' ? urlPeriod : (legacy?.period ?? 'week')
  )
  const [layout, setLayoutState] = useState<PresenterLayout>(
    urlLayout === 'status' || isBoardLayout(urlLayout)
      ? (urlLayout as PresenterLayout)
      : (legacy?.layout ?? 'timeline')
  )
  const [selectedDate, setSelectedDateState] = useState(urlDate || toLocalDateString(new Date()))
  // The presenter keeps its settings in the address bar rather than reading the
  // planner's saved preference: a wall display is usually a different machine,
  // and one that should stay on whatever it was pinned to.
  const [grouping, setGroupingState] = useState<LaneGrouping>(
    isLaneGrouping(urlGrouping) ? urlGrouping : 'technician'
  )

  const updateUrl = useCallback(
    (p: Period, l: PresenterLayout, d: string, g: LaneGrouping) => {
      const params = new URLSearchParams()
      params.set('period', p)
      params.set('layout', l)
      params.set('date', d)
      params.set('group', g)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname]
  )

  const setSelectedDate = useCallback(
    (d: string) => {
      setSelectedDateState(d)
      updateUrl(period, layout, d, grouping)
    },
    [period, layout, grouping, updateUrl]
  )
  const setPeriod = (p: Period) => {
    // Status is a single day's kanban; a week has no such thing to show.
    const next: PresenterLayout = p === 'week' && layout === 'status' ? 'timeline' : layout
    setPeriodState(p)
    setLayoutState(next)
    updateUrl(p, next, selectedDate, grouping)
  }
  /** The status board is a day's kanban, so asking for it asks for a day. */
  const showStatusBoard = () => {
    setPeriodState('day')
    setLayoutState('status')
    updateUrl('day', 'status', selectedDate, grouping)
  }
  const setLayout = (l: PresenterLayout) => {
    setLayoutState(l)
    updateUrl(period, l, selectedDate, grouping)
  }
  const setGrouping = (g: LaneGrouping) => {
    setGroupingState(g)
    updateUrl(period, layout, selectedDate, g)
  }

  useEffect(() => {
    store.setTechnicians(initialTechnicians)
    store.setWorkBays(initialWorkBays)
    store.setJobs(initialAssignments)
    store.setWeekStart(initialWeekStart) /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])
  useWorkBoardWebSocket()

  const weekStart = store.weekStart || initialWeekStart
  // Day is the same board given one day's worth of columns, exactly as on the
  // planner. Switching period used to swap in a different component entirely.
  const days = period === 'day' ? [selectedDate] : getWeekDays(weekStart)

  const loadWeekData = useCallback(
    async (ws: string) => {
      store.setWeekStart(ws)
      const [assignRes, techRes, bayRes] = await Promise.all([
        getBoardJobs(ws),
        getTechnicians(),
        getWorkBays(),
      ])
      if (assignRes.success && assignRes.data) store.setJobs(assignRes.data as WorkBoardJob[])
      if (techRes.success && techRes.data) store.setTechnicians(techRes.data as Technician[])
      if (bayRes.success && bayRes.data) store.setWorkBays(bayRes.data as WorkBay[])
    },
    [store]
  )

  const ensureWeekLoaded = useCallback(
    (dateStr: string) => {
      const m = getWeekStart(new Date(dateStr + 'T12:00:00'), weekStartDay)
      if (m !== weekStart) loadWeekData(m)
    },
    [weekStart, loadWeekData, weekStartDay]
  )
  const handlePrev = () => {
    if (period === 'week') {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() - 7)
      loadWeekData(toLocalDateString(d))
    } else {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() - 1)
      const nd = toLocalDateString(d)
      setSelectedDate(nd)
      ensureWeekLoaded(nd)
    }
  }
  const handleNext = () => {
    if (period === 'week') {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() + 7)
      loadWeekData(toLocalDateString(d))
    } else {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      const nd = toLocalDateString(d)
      setSelectedDate(nd)
      ensureWeekLoaded(nd)
    }
  }
  const handleToday = () => {
    setSelectedDate(toLocalDateString(new Date()))
    loadWeekData(getWeekStart(new Date(), weekStartDay))
  }

  useEffect(() => {
    function msUntilMidnight() {
      const now = new Date()
      const m = new Date(now)
      m.setHours(24, 0, 0, 0)
      return m.getTime() - now.getTime()
    }
    let timeout: ReturnType<typeof setTimeout>
    function schedule() {
      timeout = setTimeout(() => {
        const now = new Date()
        setSelectedDate(toLocalDateString(now))
        loadWeekData(getWeekStart(now, weekStartDay))
        schedule()
      }, msUntilMidnight() + 500)
    }
    schedule()
    return () => clearTimeout(timeout)
  }, [loadWeekData, setSelectedDate, weekStartDay])

  const dateLabel =
    period === 'week' ? formatWeekRange(weekStart, locale) : formatDayDate(selectedDate, locale)

  const lanes = useMemo(
    () =>
      buildLanes({
        grouping,
        technicians: store.technicians,
        workBays: store.workBays,
        jobs: store.jobs,
        labels: {
          unlaned: grouping === 'bay' ? tb('lanes.noBay') : tb('lanes.noTechnician'),
          all: tb('lanes.everyone'),
        },
      }),
    [grouping, store.technicians, store.workBays, store.jobs, tb]
  )

  const owners = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    for (const tech of store.technicians) map.set(tech.id, { name: tech.name, color: tech.color })
    for (const bay of store.workBays) map.set(bay.id, { name: bay.name, color: bay.color })
    return map
  }, [store.technicians, store.workBays])

  const jobsByLane = useMemo(
    () =>
      groupJobsByLane(
        store.jobs,
        grouping,
        new Set(lanes.filter((lane) => !lane.isPlaceholder).map((lane) => lane.id))
      ),
    [store.jobs, grouping, lanes]
  )

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">{t('title')}</h1>
          <span className="min-w-[240px] text-sm text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Period, then how to draw it, then what the lanes are: the same
              three questions the board asks, in the same order. */}
          <div className="flex rounded-md border">
            <Button
              variant={period === 'day' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-l-md"
              onClick={() => setPeriod('day')}
            >
              {t('day')}
            </Button>
            <Button
              variant={period === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-r-md border-l"
              onClick={() => setPeriod('week')}
            >
              {t('week')}
            </Button>
          </div>

          <div className="flex rounded-md border">
            <Button
              variant={layout === 'timeline' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-l-md"
              onClick={() => setLayout('timeline')}
            >
              {tt('layoutTimeline')}
            </Button>
            <Button
              variant={layout === 'cards' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none border-x"
              onClick={() => setLayout('cards')}
            >
              {tt('layoutCards')}
            </Button>
            {/* A kanban of one day's work by status. There is no weekly
                equivalent, so choosing it switches to a day rather than
                disappearing when a week is selected: a control that moves
                around under the pointer is worse than one that acts. */}
            <Button
              variant={layout === 'status' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-r-md"
              onClick={() => showStatusBoard()}
            >
              {t('status')}
            </Button>
          </div>

          {/* Kept in place rather than removed while the status board is up:
              the kanban groups by status, so these have nothing to do, but
              hiding them shifts every control beside them. */}
          <div
            className="flex rounded-md border"
            title={layout === 'status' ? t('groupingUnused') : undefined}
          >
            <Button
              variant={grouping === 'technician' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-l-md"
              disabled={layout === 'status'}
              onClick={() => setGrouping('technician')}
            >
              {tt('technicians')}
            </Button>
            <Button
              variant={grouping === 'bay' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-r-md border-l"
              disabled={layout === 'status'}
              onClick={() => setGrouping('bay')}
            >
              {tt('workBays')}
            </Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrev} aria-label={t('previous')}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              {t('today')}
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} aria-label={t('next')}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {/* Icon only, and always the same size. The words "Live updates
                disconnected" are four times the width of "Live", so swapping
                between them shoved every control in the header sideways. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center',
                    store.connection === 'open' && 'text-green-600',
                    store.connection === 'closed' && 'animate-pulse text-red-500',
                    store.connection === 'connecting' && 'text-muted-foreground'
                  )}
                >
                  {store.connection === 'closed' ? (
                    <WifiOff className="h-4 w-4" />
                  ) : (
                    <Wifi className="h-4 w-4" />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {store.connection === 'open'
                  ? t('live')
                  : store.connection === 'closed'
                    ? t('disconnected')
                    : t('connecting')}
              </TooltipContent>
            </Tooltip>
            <LiveClock format={timeFormat} />
          </div>
        </div>
      </header>

      {layout === 'status' ? (
        <PresenterKanbanView
          date={selectedDate}
          technicians={store.technicians}
          assignments={store.jobs}
        />
      ) : lanes.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-10">
          <p className="text-lg text-muted-foreground">
            {grouping === 'bay' ? tb('noBays') : t('noTechnicians')}
          </p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-2">
          {/* The board the shop plans on, minus everything you could change:
              a wall display is read while walking past it. */}
          <DndContext>
            {layout === 'cards' ? (
              <WeekCardGrid
                days={days}
                lanes={lanes}
                jobsByLane={jobsByLane}
                todayStr={toLocalDateString(new Date())}
                timeFormat={timeFormat}
                lookup={owners}
                readOnly
                onOpenJob={noop}
              />
            ) : (
              <WeekTimeline
                days={days}
                lanes={lanes}
                jobs={store.jobs}
                grouping={grouping}
                zoom={1}
                snapMinutes={15}
                workDayStart={workDayStart}
                workDayEnd={workDayEnd}
                onOpenJob={noop}
                onSchedule={noop}
                readOnly
              />
            )}
          </DndContext>
        </div>
      )}
    </div>
  )
}
