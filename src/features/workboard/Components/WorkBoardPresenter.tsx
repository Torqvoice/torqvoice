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
import { PresenterDayView } from './PresenterDayView'
import { PresenterKanbanView } from './PresenterKanbanView'
import { PresenterTimeline } from './PresenterTimeline'
import { WeekTimeline } from './WeekTimeline'
import { WeekCardGrid } from './WeekCardGrid'
import { type BoardLayout, isBoardLayout } from '../hooks/useBoardPreferences'
import { type LaneGrouping, buildLanes, groupJobsByLane, isLaneGrouping } from '../utils/lanes'
import { useTranslations, useLocale } from 'next-intl'

type ViewMode = 'week' | 'day' | 'status' | 'timeline'

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

function LiveClock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    function update() {
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])
  if (!time) return <span className="tabular-nums">&nbsp;</span>
  return <span className="tabular-nums">{time}</span>
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
  const locale = useLocale()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const VALID_VIEWS: ViewMode[] = ['week', 'day', 'status', 'timeline']
  const urlView = searchParams.get('view') as ViewMode | null
  const urlDate = searchParams.get('date')
  const [viewMode, setViewMode] = useState<ViewMode>(
    urlView && VALID_VIEWS.includes(urlView) ? urlView : 'week'
  )
  const [selectedDate, setSelectedDateState] = useState(urlDate || toLocalDateString(new Date()))
  const urlGrouping = searchParams.get('group')
  const urlLayout = searchParams.get('layout')
  const [grouping, setGroupingState] = useState<LaneGrouping>(
    isLaneGrouping(urlGrouping) ? urlGrouping : 'technician'
  )
  // The presenter keeps its own layout in the address bar rather than reading
  // the planner's saved preference: a wall display is usually a different
  // machine, and one that should stay on whatever it was pinned to.
  const [layout, setLayoutState] = useState<BoardLayout>(
    isBoardLayout(urlLayout) ? urlLayout : 'timeline'
  )
  const updateUrl = useCallback(
    (v: ViewMode, d: string, g: LaneGrouping, l: BoardLayout) => {
      const p = new URLSearchParams()
      p.set('view', v)
      p.set('date', d)
      p.set('group', g)
      p.set('layout', l)
      router.replace(`${pathname}?${p.toString()}`, { scroll: false })
    },
    [router, pathname]
  )
  const setSelectedDate = useCallback(
    (d: string) => {
      setSelectedDateState(d)
      updateUrl(viewMode, d, grouping, layout)
    },
    [viewMode, grouping, layout, updateUrl]
  )
  const handleSetViewMode = (m: ViewMode) => {
    setViewMode(m)
    updateUrl(m, selectedDate, grouping, layout)
  }
  const setLayout = (l: BoardLayout) => {
    setLayoutState(l)
    updateUrl(viewMode, selectedDate, grouping, l)
  }
  const setGrouping = (g: LaneGrouping) => {
    setGroupingState(g)
    updateUrl(viewMode, selectedDate, g, layout)
  }

  useEffect(() => {
    store.setTechnicians(initialTechnicians)
    store.setWorkBays(initialWorkBays)
    store.setJobs(initialAssignments)
    store.setWeekStart(initialWeekStart) /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [])
  useWorkBoardWebSocket()

  const weekStart = store.weekStart || initialWeekStart
  const days = getWeekDays(weekStart)

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
    if (viewMode === 'week') {
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
    if (viewMode === 'week') {
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

  /** Week is its own period; the other three are ways of drawing one day. */
  const period: 'day' | 'week' = viewMode === 'week' ? 'week' : 'day'

  const dateLabel =
    viewMode === 'week' ? formatWeekRange(weekStart, locale) : formatDayDate(selectedDate, locale)

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
          <span className="text-sm text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Two questions, asked separately. The old row mixed them: it put
              "Timeline" and "Status" (how to draw it) next to "Day" and
              "Week" (how much to draw), so Timeline appeared twice on screen
              meaning two different things. */}
          <div className="flex rounded-md border">
            <Button
              variant={period === 'day' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-l-md"
              onClick={() => handleSetViewMode('timeline')}
            >
              {t('day')}
            </Button>
            <Button
              variant={period === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-none rounded-r-md border-l"
              onClick={() => handleSetViewMode('week')}
            >
              {t('week')}
            </Button>
          </div>

          {period === 'day' && (
            <div className="flex rounded-md border">
              <Button
                variant={viewMode === 'timeline' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none rounded-l-md"
                onClick={() => handleSetViewMode('timeline')}
              >
                {t('timeline')}
              </Button>
              <Button
                variant={viewMode === 'day' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none border-x"
                onClick={() => handleSetViewMode('day')}
              >
                {t('list')}
              </Button>
              <Button
                variant={viewMode === 'status' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none rounded-r-md"
                onClick={() => handleSetViewMode('status')}
              >
                {t('status')}
              </Button>
            </div>
          )}

          {period === 'week' && (
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
                className="rounded-none rounded-r-md border-l"
                onClick={() => setLayout('cards')}
              >
                {tt('layoutCards')}
              </Button>
            </div>
          )}

          {viewMode === 'week' && (
            <div className="flex rounded-md border">
              <Button
                variant={grouping === 'technician' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none rounded-l-md"
                onClick={() => setGrouping('technician')}
              >
                {tt('technicians')}
              </Button>
              <Button
                variant={grouping === 'bay' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none rounded-r-md border-l"
                onClick={() => setGrouping('bay')}
              >
                {tt('workBays')}
              </Button>
            </div>
          )}
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
            {store.isConnected ? (
              <span className="flex items-center gap-1.5 text-green-600" title={t('live')}>
                <Wifi className="h-4 w-4" />
                <span className="text-xs">{t('live')}</span>
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 animate-pulse text-red-500"
                title={t('disconnected')}
              >
                <WifiOff className="h-4 w-4" />
                <span className="text-xs">{t('disconnected')}</span>
              </span>
            )}
            <LiveClock />
          </div>
        </div>
      </header>

      {viewMode === 'timeline' ? (
        <PresenterTimeline
          date={selectedDate}
          technicians={store.technicians}
          assignments={store.jobs}
          workDayStart={workDayStart}
          workDayEnd={workDayEnd}
        />
      ) : viewMode === 'day' ? (
        <PresenterDayView
          date={selectedDate}
          technicians={store.technicians}
          assignments={store.jobs}
        />
      ) : viewMode === 'status' ? (
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
