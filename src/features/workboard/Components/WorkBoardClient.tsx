'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { toast } from 'sonner'
import { useWorkBoardStore, type Technician } from '../store/workboardStore'
import { useWorkBoardWebSocket } from '../hooks/useWorkBoardWebSocket'
import type { WorkBay, WorkBoardJob } from '../Actions/boardActions'
import {
  getBoardJobs,
  getUnassignedJobs,
  assignTechnician,
  moveJob,
  scheduleJob,
  unassignJob,
  updateServiceTimes,
} from '../Actions/boardActions'
import { WorkBoardToolbar, type BoardView } from './WorkBoardToolbar'
import type { WorkBoardSettings } from '../Actions/boardActions'
import { UnassignedJobsList, UnassignedJobsPanel } from './UnassignedJobsPanel'
import { TechnicianDialog } from './TechnicianDialog'
import { WorkBayDialog } from './WorkBayDialog'
import { JobDetailPopover } from './JobDetailPopover'
import { WeekTimeline, type WeekScheduleChange } from './WeekTimeline'
import { WeekCardGrid } from './WeekCardGrid'
import type { WeekDropTarget } from './WeekTimeline/useWeekDrag'
import { useBoardPreferences } from '../hooks/useBoardPreferences'
import {
  type BoardLane,
  type LaneGrouping,
  UNLANED,
  buildLanes,
  groupJobsByLane,
  isLaneGrouping,
  laneAssignment,
  helpersAfterTechnicianChange,
  laneIdsForJob,
} from '../utils/lanes'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer'
import { Users, Wrench, ClipboardCheck, Columns3, Inbox, Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { VehiclePickerDialog } from '@/components/vehicle-picker-dialog'
import { timeToMinutes } from '../utils/datetime'
import {
  boardNow,
  fromBoardDate,
  fromBoardSpan,
  toBoardDate,
  toBoardJob,
} from '../utils/board-time'
import { useDateSettings } from '@/components/date-settings-context'
import { awayKey, useBoardCalendar } from '../hooks/useBoardCalendar'
import { overlapsSpans } from '@/features/workshop-calendar/Lib/boardDays'
import { TimeOffDialog } from '@/features/workshop-calendar/Components/TimeOffDialog'
import { TimeOffManagerDialog } from '@/features/workshop-calendar/Components/TimeOffManagerDialog'

/** Minutes a job gets when it is dropped onto the week with no duration of its own. */
const DEFAULT_JOB_MINUTES = 60

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekStartDate(date: Date, weekStartDay: number): string {
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

function isWeekend(date: string): boolean {
  const day = new Date(date + 'T12:00:00').getDay()
  return day === 0 || day === 6
}

/** Where a dnd-kit drag was released, derived from its own event data. */
function pointerAt(event: DragEndEvent): { x: number; y: number } | null {
  const activator = event.activatorEvent as { clientX?: number; clientY?: number } | undefined
  if (activator?.clientX === undefined || activator.clientY === undefined) return null
  return {
    x: activator.clientX + event.delta.x,
    y: activator.clientY + event.delta.y,
  }
}

/**
 * What follows the cursor while a job is in the air.
 *
 * Deliberately a single small line rather than the full card: the board draws a
 * ghost at the snapped slot underneath, and a card the size of the real one sat
 * squarely on top of it, hiding the very thing you were aiming with. Offset
 * down and right of the cursor for the same reason.
 */
function DragChip({
  title,
  subtitle,
  isInspection,
}: {
  title: string
  subtitle?: string | null
  isInspection?: boolean
}) {
  return (
    <div className="pointer-events-none max-w-[200px] translate-x-3 translate-y-3">
      <div className="flex items-center gap-1 rounded-md border bg-card/95 px-1.5 py-0.5 text-[11px] shadow-md backdrop-blur-sm">
        {isInspection ? (
          <ClipboardCheck className="h-3 w-3 shrink-0 text-green-500" />
        ) : (
          <Wrench className="h-3 w-3 shrink-0 text-blue-500" />
        )}
        <span className="truncate font-medium">{title}</span>
        {subtitle && <span className="truncate text-muted-foreground">{subtitle}</span>}
      </div>
    </div>
  )
}

export function WorkBoardClient({
  initialTechnicians,
  initialWorkBays,
  initialAssignments,
  initialUnassigned,
  initialWeekStart,
  boardSettings,
}: {
  initialTechnicians: Technician[]
  initialWorkBays: WorkBay[]
  initialAssignments: WorkBoardJob[]
  initialUnassigned: { serviceRecords: unknown[]; inspections: unknown[] }
  initialWeekStart: string
  boardSettings: WorkBoardSettings
}) {
  const store = useWorkBoardStore()
  const t = useTranslations('workBoard.board')
  const tToolbar = useTranslations('workBoard.toolbar')
  const tCal = useTranslations('workshopCalendar')
  const { timeFormat, timezone } = useDateSettings()
  const tUnassigned = useTranslations('workBoard.unassigned')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const urlView = searchParams.get('view') as BoardView | null
  const urlDate = searchParams.get('date')
  const urlWeek = searchParams.get('week')
  const urlGrouping = searchParams.get('group')

  useEffect(() => {
    store.setTechnicians(initialTechnicians)
    store.setWorkBays(initialWorkBays)
    store.setJobs(initialAssignments)
    store.setUnassigned(
      initialUnassigned.serviceRecords as Parameters<typeof store.setUnassigned>[0],
      initialUnassigned.inspections as Parameters<typeof store.setUnassigned>[1]
    )
    store.setWeekStart(urlWeek || initialWeekStart)
    if (urlWeek && urlWeek !== initialWeekStart) {
      getBoardJobs(urlWeek).then((res) => {
        if (res.success && res.data) store.setJobs(res.data as WorkBoardJob[])
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useWorkBoardWebSocket()

  const { preferences, update: updatePreferences } = useBoardPreferences(
    isLaneGrouping(urlGrouping) ? { grouping: urlGrouping } : undefined
  )

  const [view, setViewState] = useState<BoardView>(
    urlView === 'day' || urlView === 'week' ? urlView : 'week'
  )
  const [selectedDate, setSelectedDateState] = useState(urlDate || boardNow(timezone).dayKey)
  const [techDialogOpen, setTechDialogOpen] = useState(false)
  const [editingTech, setEditingTech] = useState<Technician | null>(null)
  const [bayDialogOpen, setBayDialogOpen] = useState(false)
  const [editingBay, setEditingBay] = useState<WorkBay | null>(null)
  const [selectedJob, setSelectedJob] = useState<WorkBoardJob | null>(null)
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeDrag, setActiveDrag] = useState<{
    id: string
    job?: WorkBoardJob
    unassignedJob?: { job: Record<string, unknown>; type: 'serviceRecord' | 'inspection' }
  } | null>(null)
  const [vehiclePickerOpen, setVehiclePickerOpen] = useState(false)
  const [boardContext, setBoardContext] = useState<Record<string, string>>({})

  const weekDropResolver = useRef<
    ((clientX: number, clientY: number) => WeekDropTarget | null) | null
  >(null)

  const unassignedCount = store.unassignedServiceRecords.length + store.unassignedInspections.length

  const weekStart = store.weekStart || initialWeekStart

  // Everything the board draws reads the workshop's wall clock; the store
  // keeps the real instants. See utils/board-time.ts.
  const boardJobs = useMemo(
    () => store.jobs.map((job) => toBoardJob(job, timezone)),
    [store.jobs, timezone]
  )
  /** The job as stored, for anything that reads or writes real instants. */
  const realJob = useCallback(
    (job: WorkBoardJob) =>
      useWorkBoardStore.getState().jobs.find((candidate) => candidate.id === job.id) ?? job,
    []
  )
  const todayStr = boardNow(timezone).dayKey

  const allDays = useMemo(() => getWeekDays(weekStart), [weekStart])

  const lanes = useMemo(
    () =>
      buildLanes({
        grouping: preferences.grouping,
        technicians: store.technicians,
        workBays: store.workBays,
        jobs: boardJobs,
        labels: {
          unlaned: preferences.grouping === 'bay' ? t('lanes.noBay') : t('lanes.noTechnician'),
          all: t('lanes.everyone'),
        },
      }),
    [preferences.grouping, store.technicians, store.workBays, boardJobs, t]
  )

  const visibleLanes = useMemo(
    () => lanes.filter((lane) => !preferences.hiddenLaneIds.includes(lane.id)),
    [lanes, preferences.hiddenLaneIds]
  )

  /** Lanes carrying work in the week on screen, for the "only these" shortcut. */
  const busyLaneIds = useMemo(() => {
    const ids = new Set<string>()
    // A lane with only somebody's second job in it is carrying work too.
    for (const job of boardJobs)
      for (const id of laneIdsForJob(job, preferences.grouping)) ids.add(id)
    return lanes.filter((lane) => ids.has(lane.id)).map((lane) => lane.id)
  }, [boardJobs, lanes, preferences.grouping])

  // The workshop calendar for the week: closed days and, on a board grouped
  // by technician, who is away. Nothing here stops a drop; it only shows and
  // warns.
  const technicianLaneIds = useMemo(
    () =>
      preferences.grouping === 'technician'
        ? lanes.filter((lane) => !lane.isPlaceholder).map((lane) => lane.id)
        : [],
    [lanes, preferences.grouping]
  )
  const boardCalendar = useBoardCalendar({ days: allDays, technicianLaneIds })
  // A weekend day the workshop opens on is a working day: the Weekends
  // switch only hides the ones it is closed on.
  const openWeekdays = boardCalendar.calendar?.week
  const isHiddenWeekend = useCallback(
    (d: string) => isWeekend(d) && !openWeekdays?.[new Date(`${d}T12:00:00Z`).getUTCDay()]?.open,
    [openWeekdays]
  )

  // Day is the same board with one day's worth of columns, not a different
  // component. Switching period used to swap in an entirely separate view,
  // which threw away the grouping, the lane filter, the zoom and the tooltips.
  const weekDays = useMemo(
    () => (preferences.showWeekends ? allDays : allDays.filter((d) => !isHiddenWeekend(d))),
    [allDays, preferences.showWeekends, isHiddenWeekend]
  )
  const days = useMemo(
    () => (view === 'day' ? [selectedDate] : weekDays),
    [view, selectedDate, weekDays]
  )
  const hiddenDays = useMemo(
    () => (view === 'day' || preferences.showWeekends ? [] : allDays.filter(isHiddenWeekend)),
    [view, allDays, preferences.showWeekends, isHiddenWeekend]
  )
  const [timeOffOpen, setTimeOffOpen] = useState(false)
  const [timeOffFor, setTimeOffFor] = useState<string | null>(null)
  const timeOffTechnicians = useMemo(
    () => store.technicians.map((tech) => ({ id: tech.id, name: tech.name, color: tech.color })),
    [store.technicians]
  )

  /**
   * After a job lands on the board: say so when the workshop is closed then
   * or the technician is away. The job stays where it was put. Takes real
   * instants; the calendar's days and spans are the workshop's wall clock.
   */
  const warnAboutCalendar = useCallback(
    (laneId: string, startAt: Date, endAt: Date) => {
      const start = toBoardDate(startAt, timezone)
      const end = toBoardDate(endAt, timezone)
      const date = toLocalDateString(start)
      const startMins = start.getHours() * 60 + start.getMinutes()
      const endMins =
        toLocalDateString(end) === date ? end.getHours() * 60 + end.getMinutes() : 24 * 60
      const closed = boardCalendar.closedByDay?.[date]
      if (closed) {
        if (closed.names.length > 0 && overlapsSpans(closed.closureSpans, startMins, endMins)) {
          toast.warning(tCal('board.dropClosed', { name: closed.names.join(', ') }))
        } else if (closed.allDay) {
          toast.warning(tCal('board.dropClosedWeekday'))
        }
      }
      const away = boardCalendar.awayByLaneDay?.[awayKey(laneId, date)]
      if (away && overlapsSpans(away.spans, startMins, endMins)) {
        const name = store.technicians.find((tech) => tech.id === laneId)?.name ?? ''
        toast.warning(tCal('board.dropAway', { name, reason: away.label }))
      }
    },
    [boardCalendar.closedByDay, boardCalendar.awayByLaneDay, store.technicians, tCal, timezone]
  )

  /** Every lane the shop has, by id, whichever grouping is on. */
  const owners = useMemo(() => {
    const map = new Map<string, { name: string; color: string }>()
    for (const tech of store.technicians) map.set(tech.id, { name: tech.name, color: tech.color })
    for (const bay of store.workBays) map.set(bay.id, { name: bay.name, color: bay.color })
    return map
  }, [store.technicians, store.workBays])

  /** Jobs bucketed for the card layout, which has no drag preview to fold in. */
  const jobsByLane = useMemo(
    () =>
      groupJobsByLane(
        boardJobs,
        preferences.grouping,
        new Set(visibleLanes.filter((lane) => !lane.isPlaceholder).map((lane) => lane.id))
      ),
    [boardJobs, preferences.grouping, visibleLanes]
  )

  const toggleLane = useCallback(
    (laneId: string) => {
      const hidden = preferences.hiddenLaneIds
      updatePreferences({
        hiddenLaneIds: hidden.includes(laneId)
          ? hidden.filter((id) => id !== laneId)
          : [...hidden, laneId],
      })
    },
    [preferences.hiddenLaneIds, updatePreferences]
  )

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor)
  )

  const updateUrl = useCallback(
    (newView: BoardView, newDate: string, newWeekStart: string, grouping: LaneGrouping) => {
      const params = new URLSearchParams()
      params.set('view', newView)
      params.set('date', newDate)
      params.set('week', newWeekStart)
      params.set('group', grouping)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname]
  )

  const setView = useCallback(
    (v: BoardView) => {
      setViewState(v)
      updateUrl(v, selectedDate, weekStart, preferences.grouping)
    },
    [selectedDate, weekStart, preferences.grouping, updateUrl]
  )
  const setSelectedDate = useCallback(
    (d: string) => {
      setSelectedDateState(d)
      updateUrl(view, d, weekStart, preferences.grouping)
    },
    [view, weekStart, preferences.grouping, updateUrl]
  )
  const setGrouping = useCallback(
    (grouping: LaneGrouping) => {
      updatePreferences({ grouping })
      updateUrl(view, selectedDate, weekStart, grouping)
    },
    [updatePreferences, updateUrl, view, selectedDate, weekStart]
  )

  const loadWeekData = useCallback(
    async (ws: string) => {
      store.setWeekStart(ws)
      updateUrl(view, selectedDate, ws, preferences.grouping)
      const [assignRes, unassignedRes] = await Promise.all([getBoardJobs(ws), getUnassignedJobs()])
      if (assignRes.success && assignRes.data) store.setJobs(assignRes.data as WorkBoardJob[])
      if (unassignedRes.success && unassignedRes.data)
        store.setUnassigned(
          unassignedRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0],
          unassignedRes.data.inspections as Parameters<typeof store.setUnassigned>[1]
        )
    },
    [store, view, selectedDate, preferences.grouping, updateUrl]
  )

  const handlePrevWeek = () => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() - 7)
    loadWeekData(toLocalDateString(d))
  }
  const handleNextWeek = () => {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + 7)
    loadWeekData(toLocalDateString(d))
  }
  const handleToday = () => {
    const today = boardNow(timezone).dayKey
    setSelectedDate(today)
    loadWeekData(getWeekStartDate(new Date(`${today}T12:00:00`), boardSettings.weekStartDay))
  }
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    const nd = toLocalDateString(d)
    setSelectedDate(nd)
    const nw = getWeekStartDate(d, boardSettings.weekStartDay)
    if (nw !== weekStart) loadWeekData(nw)
  }
  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const nd = toLocalDateString(d)
    setSelectedDate(nd)
    const nw = getWeekStartDate(d, boardSettings.weekStartDay)
    if (nw !== weekStart) loadWeekData(nw)
  }

  const openVehiclePicker = useCallback(async (context: Record<string, string>) => {
    setBoardContext(context)
    setVehiclePickerOpen(true)
  }, [])

  const handleCreateInWeek = useCallback(
    (lane: BoardLane, date: string, startMins: number) => {
      const toTime = (mins: number) =>
        `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
      const context: Record<string, string> = {
        boardDate: date,
        boardStart: toTime(startMins),
        boardEnd: toTime(startMins + DEFAULT_JOB_MINUTES),
      }
      if (lane.grouping === 'technician') context.boardTech = lane.id
      if (lane.grouping === 'bay') context.boardBay = lane.id
      return openVehiclePicker(context)
    },
    [openVehiclePicker]
  )

  /**
   * Persist a lane and time change made by dragging on the week timeline.
   * `start` and `end` are board dates, so they are turned back into real
   * instants before anything is stored or sent.
   */
  const handleWeekSchedule = useCallback(
    async ({ job: drawn, laneId, start: boardStart, end: boardEnd }: WeekScheduleChange) => {
      const job = realJob(drawn)
      // A move keeps the job's real length; see fromBoardSpan for why the
      // two board dates cannot simply be converted on their own.
      const { start, end } = fromBoardSpan({
        stored: job,
        drawn,
        boardStart,
        boardEnd,
        timeZone: timezone,
      })
      const assignment = laneAssignment(laneId, preferences.grouping)
      const previous = {
        technicianId: job.technicianId,
        helperIds: job.helperIds,
        workBayId: job.workBayId,
        startDateTime: job.startDateTime,
        endDateTime: job.endDateTime,
      }

      store.optimisticSchedule(job.id, {
        ...assignment,
        // Dropped into a helper's lane, the two swap; out of every lane, the
        // helpers go too. Drawn now as the server is about to write it.
        ...(assignment.technicianId !== undefined
          ? { helperIds: helpersAfterTechnicianChange(job, assignment.technicianId) }
          : {}),
        startDateTime: start.toISOString(),
        endDateTime: end.toISOString(),
      })

      const res = await scheduleJob({
        id: job.id,
        type: job.type,
        ...assignment,
        startDateTime: start,
        endDateTime: end,
      })

      if (!res.success) {
        store.optimisticSchedule(job.id, previous)
        toast.error(t('failedMove'), { description: res.error })
      } else {
        if (res.data) store.updateJob(res.data as WorkBoardJob)
        warnAboutCalendar(laneId, start, end)
      }
    },
    [preferences.grouping, store, t, warnAboutCalendar, realJob, timezone]
  )

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current
    if (data?.job && data.job.type) setActiveDrag({ id: event.active.id as string, job: data.job })
    else if (data?.job && data?.type)
      setActiveDrag({
        id: event.active.id as string,
        unassignedJob: { job: data.job, type: data.type as 'serviceRecord' | 'inspection' },
      })
    else setActiveDrag({ id: event.active.id as string })
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveDrag(null)
    const { active, over } = event
    if (!over) return
    const overData = over.data.current as
      | {
          technicianId?: string
          laneId?: string
          date?: string
          unassigned?: boolean
          week?: boolean
        }
      | undefined
    if (!overData) return
    const activeData = active.data.current

    // Drop assigned job onto unassigned panel
    if (overData.unassigned && activeData?.job && activeData.job.type) {
      const job = realJob(activeData.job as WorkBoardJob)
      if (!job.technicianId && !job.workBayId) return
      store.removeJob(job.id)
      // A request that never reaches the server throws instead of answering;
      // the job is still assigned, so it goes back on the board.
      const res = await unassignJob({ id: job.id, type: job.type }).catch(() => null)
      if (!res?.success) {
        toast.error(t('failedRemove'), { description: res?.error })
        store.addJob(job)
      } else {
        const unRes = await getUnassignedJobs()
        if (unRes.success && unRes.data)
          store.setUnassigned(
            unRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0],
            unRes.data.inspections as Parameters<typeof store.setUnassigned>[1]
          )
      }
      return
    }

    // Drop onto the week timeline: the lane, the day and the time all come
    // from where the pointer actually was, not from the column's mid-point.
    if (overData.week) {
      const point = pointerAt(event)
      const target = point ? weekDropResolver.current?.(point.x, point.y) : null
      const laneId = target?.laneId ?? overData.laneId
      const date = target?.date ?? overData.date
      if (!laneId || !date || laneId === UNLANED) return

      const startMins = target?.startMins ?? timeToMinutes(boardSettings.workDayStart)
      const start = new Date(`${date}T00:00:00`)
      start.setMinutes(startMins)

      if (!activeData?.job) return
      const assignment = laneAssignment(laneId, preferences.grouping)
      const end = new Date(start.getTime() + DEFAULT_JOB_MINUTES * 60_000)

      // An assigned job dragged between cells of the card layout: it keeps the
      // time of day it already had and only changes lane and date.
      if (activeData.job.type && !activeData.unscheduled) {
        const job = activeData.job as WorkBoardJob
        const previousStart = job.startDateTime ? new Date(job.startDateTime) : null
        const previousEnd = job.endDateTime ? new Date(job.endDateTime) : null
        const duration =
          previousStart && previousEnd
            ? previousEnd.getTime() - previousStart.getTime()
            : DEFAULT_JOB_MINUTES * 60_000
        const movedStart = new Date(`${date}T00:00:00`)
        movedStart.setMinutes(
          previousStart
            ? previousStart.getHours() * 60 + previousStart.getMinutes()
            : timeToMinutes(boardSettings.workDayStart)
        )
        return handleWeekSchedule({
          job,
          laneId,
          start: movedStart,
          end: new Date(movedStart.getTime() + duration),
        })
      }

      // Already on the board, just never given a time.
      if (activeData.unscheduled) {
        return handleWeekSchedule({
          job: activeData.job as WorkBoardJob,
          laneId,
          start,
          end,
        })
      }

      if (activeData.type) {
        // A job coming from the unassigned panel: it has no lane and no times.
        const pooled = activeData.job as { id: string }
        const type = activeData.type as 'serviceRecord' | 'inspection'

        // Ungrouped, the board has one lane and dropping into it would name no
        // technician and no bay: the job would leave the pool and land nowhere.
        if (Object.keys(assignment).length === 0) {
          toast.error(t('dropNeedsLane'))
          return
        }

        store.removeFromUnassigned(pooled.id, type)
        const startAt = fromBoardDate(start, timezone)
        const endAt = fromBoardDate(end, timezone)
        const res = await scheduleJob({
          id: pooled.id,
          type,
          ...assignment,
          startDateTime: startAt,
          endDateTime: endAt,
        })
        if (!res.success) {
          toast.error(t('failedAssign'), { description: res.error })
          store.addToUnassigned(activeData.job, type)
        } else {
          if (res.data) store.addJob(res.data as WorkBoardJob)
          warnAboutCalendar(laneId, startAt, endAt)
        }
      }
      return
    }

    if (!overData.technicianId) return

    if (activeData?.job && activeData.job.type) {
      // Drawn on the board's clock; `stored` is the same job with real instants.
      const job = activeData.job as WorkBoardJob
      const stored = realJob(job)
      const dropDate = overData.date
      const jobDate = job.startDateTime ? job.startDateTime.split('T')[0] : null
      const sameTech = job.technicianId === overData.technicianId
      const sameDay = dropDate && jobDate && dropDate === jobDate

      if (sameTech && sameDay) return

      // Move to different tech if needed
      if (!sameTech) {
        store.optimisticMove(job.id, overData.technicianId)
        const res = await moveJob({
          id: job.id,
          technicianId: overData.technicianId,
          sortOrder: 0,
          type: job.type,
        })
        if (!res.success) {
          toast.error(t('failedMove'), { description: res.error })
          // The whole job back as it was, helpers included.
          store.updateJob(stored)
          return
        } else if (res.data) store.updateJob(res.data as WorkBoardJob)
      }

      // Update dates if dropped on a different day
      if (!sameDay && dropDate) {
        // The time of day from the drawn job, the length from the stored one:
        // two board dates are a different distance apart when the viewer's
        // own clocks change between them.
        const oldStart = job.startDateTime ? new Date(job.startDateTime) : null
        const realStart = stored.startDateTime ? new Date(stored.startDateTime) : null
        const realEnd = stored.endDateTime ? new Date(stored.endDateTime) : null
        const duration =
          realStart && realEnd ? realEnd.getTime() - realStart.getTime() : 60 * 60 * 1000
        const timeOfDay = oldStart
          ? `${String(oldStart.getHours()).padStart(2, '0')}:${String(oldStart.getMinutes()).padStart(2, '0')}`
          : boardSettings.workDayStart
        const newStart = fromBoardDate(new Date(dropDate + 'T' + timeOfDay + ':00'), timezone)
        const newEnd = new Date(newStart.getTime() + duration)
        store.updateServiceTimes(job.id, newStart.toISOString(), newEnd.toISOString())
        const timeRes = await updateServiceTimes({
          id: job.id,
          startDateTime: newStart,
          endDateTime: newEnd,
        })
        if (!timeRes.success) {
          toast.error(t('failedMove'), { description: timeRes.error })
        }
      }
      return
    }

    if (activeData?.job && activeData?.type) {
      const job = activeData.job
      const jobType = activeData.type as 'serviceRecord' | 'inspection'
      // Set default time on the drop target's date (1 hour block at work day start)
      const dropDate = overData.date || selectedDate
      const startDateTime = fromBoardDate(
        new Date(dropDate + 'T' + boardSettings.workDayStart + ':00'),
        timezone
      )
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000)
      store.removeFromUnassigned(job.id, jobType)
      const res = await assignTechnician({
        id: job.id,
        technicianId: overData.technicianId,
        type: jobType,
        startDateTime,
        endDateTime,
      })
      if (!res.success) {
        toast.error(t('failedAssign'), { description: res.error })
        store.addToUnassigned(job, jobType)
      } else if (res.data) store.addJob(res.data as WorkBoardJob)
    }
  }

  const handleRemoveJob = async (job: WorkBoardJob) => {
    setPopoverOpen(false)
    setSelectedJob(null)
    store.removeJob(job.id)
    // As when a job is dragged off the board: one that could not be
    // unassigned goes back on it.
    const res = await unassignJob({ id: job.id, type: job.type }).catch(() => null)
    if (!res?.success) {
      toast.error(t('failedRemove'), { description: res?.error })
      store.addJob(job)
    } else {
      const unRes = await getUnassignedJobs()
      if (unRes.success && unRes.data)
        store.setUnassigned(
          unRes.data.serviceRecords as Parameters<typeof store.setUnassigned>[0],
          unRes.data.inspections as Parameters<typeof store.setUnassigned>[1]
        )
    }
  }

  // The dialog reads and writes real instants, so it gets the stored job, not
  // the one drawn on the board's clock.
  const handleCardClick = useCallback(
    (job: WorkBoardJob) => {
      setSelectedJob(realJob(job))
      setPopoverOpen(true)
    },
    [realJob]
  )

  const handleLaneClick = useCallback(
    (lane: BoardLane) => {
      if (lane.grouping === 'technician') {
        const tech = store.technicians.find((candidate) => candidate.id === lane.id)
        if (tech) {
          setEditingTech(tech)
          setTechDialogOpen(true)
        }
        return
      }
      if (lane.grouping === 'bay') {
        const bay = store.workBays.find((candidate) => candidate.id === lane.id)
        if (bay) {
          setEditingBay(bay)
          setBayDialogOpen(true)
        }
      }
    },
    [store.technicians, store.workBays]
  )

  const openAddBay = () => {
    setEditingBay(null)
    setBayDialogOpen(true)
  }
  const openAddTech = () => {
    setEditingTech(null)
    setTechDialogOpen(true)
  }

  const toolbar = (
    <WorkBoardToolbar
      weekStart={weekStart}
      selectedDate={selectedDate}
      view={view}
      grouping={preferences.grouping}
      layout={preferences.layout}
      showWeekends={preferences.showWeekends}
      lanes={lanes}
      hiddenLaneIds={preferences.hiddenLaneIds}
      busyLaneIds={busyLaneIds}
      onToggleLane={toggleLane}
      onShowAllLanes={() => updatePreferences({ hiddenLaneIds: [] })}
      onShowBusyLanes={() =>
        updatePreferences({
          hiddenLaneIds: lanes
            .filter((lane) => !busyLaneIds.includes(lane.id))
            .map((lane) => lane.id),
        })
      }
      onPrevWeek={handlePrevWeek}
      onNextWeek={handleNextWeek}
      onPrevDay={handlePrevDay}
      onNextDay={handleNextDay}
      onToday={handleToday}
      onAddTech={openAddTech}
      onAddBay={openAddBay}
      onTimeOff={boardCalendar.enabled ? () => setTimeOffOpen(true) : undefined}
      onViewChange={setView}
      onGroupingChange={setGrouping}
      onLayoutChange={(layout) => updatePreferences({ layout })}
      onToggleWeekends={() => updatePreferences({ showWeekends: !preferences.showWeekends })}
    />
  )

  if (store.technicians.length === 0 && store.workBays.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        {toolbar}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-20">
          <Users className="h-12 w-12 text-muted-foreground/40" />
          <div className="text-center">
            <h3 className="text-lg font-medium">{t('noTechnicians')}</h3>
            <p className="text-sm text-muted-foreground">{t('noTechniciansDescription')}</p>
          </div>
          <Button onClick={openAddTech}>
            <Plus className="mr-1 h-4 w-4" />
            {tToolbar('addTechnician')}
          </Button>
        </div>
        <TechnicianDialog open={techDialogOpen} onOpenChange={setTechDialogOpen} />
        <WorkBayDialog open={bayDialogOpen} onOpenChange={setBayDialogOpen} />
      </div>
    )
  }

  const dragOverlay = activeDrag?.job ? (
    <DragChip
      title={activeDrag.job.title}
      subtitle={
        activeDrag.job.vehicle?.licensePlate ??
        (activeDrag.job.vehicle
          ? `${activeDrag.job.vehicle.make} ${activeDrag.job.vehicle.model}`
          : null)
      }
      isInspection={activeDrag.job.type === 'inspection'}
    />
  ) : activeDrag?.unassignedJob ? (
    <DragChip
      title={
        (activeDrag.unassignedJob.job.title as string) ??
        (activeDrag.unassignedJob.job.template as { name: string })?.name ??
        ''
      }
      subtitle={
        (activeDrag.unassignedJob.job.vehicle as { licensePlate: string | null } | undefined)
          ?.licensePlate ?? null
      }
      isInspection={activeDrag.unassignedJob.type === 'inspection'}
    />
  ) : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {toolbar}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
          {visibleLanes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
              <Columns3 className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">{t('noBays')}</p>
              <Button size="sm" onClick={openAddBay}>
                {t('addFirstBay')}
              </Button>
            </div>
          ) : preferences.layout === 'cards' ? (
            <WeekCardGrid
              days={days}
              lanes={visibleLanes}
              jobsByLane={jobsByLane}
              todayStr={todayStr}
              timeFormat={timeFormat}
              lookup={owners}
              onOpenJob={handleCardClick}
              onLaneClick={handleLaneClick}
              closedByDay={boardCalendar.closedByDay}
              awayByLaneDay={boardCalendar.awayByLaneDay}
            />
          ) : (
            <WeekTimeline
              days={days}
              hiddenDays={hiddenDays}
              lanes={visibleLanes}
              jobs={boardJobs}
              grouping={preferences.grouping}
              zoom={preferences.zoom}
              onZoomChange={(zoom) => updatePreferences({ zoom })}
              snapMinutes={preferences.snapMinutes}
              workDayStart={boardSettings.workDayStart}
              workDayEnd={boardSettings.workDayEnd}
              owners={owners}
              dropResolverRef={weekDropResolver}
              onOpenJob={handleCardClick}
              onSchedule={handleWeekSchedule}
              onCreateJob={handleCreateInWeek}
              onLaneClick={handleLaneClick}
              onShowHiddenDays={() => updatePreferences({ showWeekends: true })}
              onShowWholeWeek={view === 'week' ? () => setGrouping('none') : undefined}
              closedByDay={boardCalendar.closedByDay}
              awayByLaneDay={boardCalendar.awayByLaneDay}
            />
          )}
          <UnassignedJobsPanel />
        </div>
        <DragOverlay dropAnimation={null}>{dragOverlay}</DragOverlay>
      </DndContext>

      {/* The sidebar is hidden below md, so the same list gets a drawer. */}
      <Drawer>
        <DrawerTrigger asChild>
          <Button variant="outline" size="sm" className="w-full md:hidden">
            <Inbox className="mr-1.5 h-3.5 w-3.5" />
            {tUnassigned('title', { count: unassignedCount })}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="max-h-[80svh]">
          <DrawerHeader>
            <DrawerTitle>{tUnassigned('title', { count: unassignedCount })}</DrawerTitle>
          </DrawerHeader>
          <UnassignedJobsList />
        </DrawerContent>
      </Drawer>

      {selectedJob && (
        <JobDetailPopover
          job={selectedJob}
          open={popoverOpen}
          onOpenChange={(o) => {
            setPopoverOpen(o)
            if (!o) setSelectedJob(null)
          }}
          onRemove={() => handleRemoveJob(selectedJob)}
        />
      )}
      <TechnicianDialog
        open={techDialogOpen}
        onOpenChange={setTechDialogOpen}
        technician={editingTech}
        onSetTimeOff={boardCalendar.enabled ? (tech) => setTimeOffFor(tech.id) : undefined}
      />
      <TimeOffManagerDialog
        open={timeOffOpen}
        onOpenChange={setTimeOffOpen}
        technicians={timeOffTechnicians}
        today={todayStr}
        onChanged={boardCalendar.reload}
      />
      <TimeOffDialog
        open={timeOffFor !== null}
        onOpenChange={(open) => {
          if (!open) setTimeOffFor(null)
        }}
        technicians={timeOffTechnicians}
        defaultTechnicianId={timeOffFor ?? undefined}
        defaultDate={todayStr}
        onSaved={boardCalendar.reload}
      />
      <WorkBayDialog open={bayDialogOpen} onOpenChange={setBayDialogOpen} workBay={editingBay} />
      <VehiclePickerDialog
        open={vehiclePickerOpen}
        onOpenChange={(open) => {
          setVehiclePickerOpen(open)
          if (!open) setBoardContext({})
        }}
        redirectQuery={boardContext}
      />
    </div>
  )
}
