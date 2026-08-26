'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDndMonitor } from '@dnd-kit/core'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useDateSettings } from '@/components/date-settings-context'
import type { WorkBoardJob } from '../../Actions/boardActions'
import { MAX_ZOOM, MIN_ZOOM, ZOOM_STEP, clampZoom } from '../../hooks/useBoardPreferences'
import { timeToMinutes } from '../../utils/datetime'
import { formatClock } from '../../utils/clock'
import {
  type BoardLane,
  type LaneGrouping,
  UNLANED,
  groupJobsByLane,
  laneIdForJob,
} from '../../utils/lanes'
import {
  MINUTES_IN_DAY,
  bookedMinutesOnDay,
  computeTimeWindow,
  hourMarks,
  isUnscheduled,
  resolveJobOnDay,
} from '../../utils/layout'
import { LaneHeaderTooltip } from '../LaneHeaderTooltip'
import { UnscheduledStrip } from './UnscheduledStrip'
import { WeekLaneColumn } from './WeekLaneColumn'
import {
  DEFAULT_JOB_MINUTES,
  columnKey,
  percentForMinutes,
  pointerFromDndEvent,
  windowMinutes,
} from './geometry'
import { useDragToPan } from './useDragToPan'
import { type WeekDropTarget, useWeekDrag } from './useWeekDrag'

/** Quarter-hour rules once there is room for them. */
const FINE_SLOT_FROM_ZOOM = 1.5

const GUTTER_WIDTH = 60
/** Low enough that a shop with eight bays still sees Monday to Friday at once;
 *  tracks are `1fr` above it, so a shop with two lanes gets wide columns. */
const MIN_COLUMN_WIDTH = 44
/** Both header rows are fixed height: the lane row needs to know where to
 *  stick underneath the day row, and the body needs to know how much of the
 *  board is left for it. */
const DAY_HEADER_HEIGHT = 26
const LANE_HEADER_HEIGHT = 34
/** Below this an hour is too thin to drop anything into. */
const MIN_PX_PER_MINUTE = 0.3

export type WeekScheduleChange = {
  job: WorkBoardJob
  laneId: string
  start: Date
  end: Date
}

/**
 * The whole week on one clock.
 *
 * Time runs down the left and every day is split into a column per lane, which
 * is how a workshop's own wall planner reads: what is on, in which bay, and for
 * how long, without opening anything.
 */
export function WeekTimeline({
  days,
  hiddenDays,
  lanes,
  jobs,
  grouping,
  zoom,
  onZoomChange,
  snapMinutes,
  workDayStart,
  workDayEnd,
  dropResolverRef,
  onOpenJob,
  onSchedule,
  onCreateJob,
  onLaneClick,
  onShowHiddenDays,
  onShowWholeWeek,
  owners,
  readOnly = false,
}: {
  days: string[]
  /** Days left out of the grid, so work on them can still be accounted for. */
  hiddenDays?: string[]
  lanes: BoardLane[]
  jobs: WorkBoardJob[]
  grouping: LaneGrouping
  /** 1 fits the day to the board; above that the hours grow and it scrolls. */
  zoom: number
  snapMinutes: number
  onZoomChange?: (zoom: number) => void
  /** "HH:MM" from workshop settings. */
  workDayStart: string
  workDayEnd: string
  /**
   * Filled with a resolver so the board's drag-and-drop handler can turn a drop
   * point into a lane, a day and a time.
   */
  dropResolverRef?: React.MutableRefObject<
    ((clientX: number, clientY: number) => WeekDropTarget | null) | null
  >
  onOpenJob: (job: WorkBoardJob) => void
  onSchedule: (change: WeekScheduleChange) => void
  onCreateJob?: (lane: BoardLane, date: string, startMins: number) => void
  onLaneClick?: (lane: BoardLane) => void
  onShowHiddenDays?: () => void
  /** Collapses the board to a column per day, which always fits. */
  onShowWholeWeek?: () => void
  /** Technicians and bays by id, so an ungrouped board can still say whose job it is. */
  owners?: Map<string, { name: string; color: string }>
  /** Wall-display mode: the same board, with nothing to drag or open. */
  readOnly?: boolean
}) {
  const t = useTranslations('workBoard.week')
  const locale = useLocale()
  const { timeFormat } = useDateSettings()
  const scrollRef = useRef<HTMLDivElement>(null)
  const hasScrolled = useRef(false)

  const dayStartMins = timeToMinutes(workDayStart)
  const dayEndMins = timeToMinutes(workDayEnd)

  const scheduled = useMemo(() => jobs.filter((job) => !isUnscheduled(job)), [jobs])
  const unscheduled = useMemo(() => jobs.filter(isUnscheduled), [jobs])

  const timeWindow = useMemo(
    () => computeTimeWindow(scheduled, days, dayStartMins, dayEndMins),
    [scheduled, days, dayStartMins, dayEndMins]
  )

  const showLaneHeaders = grouping !== 'none'

  // CSS owns the height. The body row is `minmax(<floor>, 1fr)`, so it fills
  // the board when there is room and grows past it when zoomed in; everything
  // inside is placed as a percentage of that row. Nothing has to be measured,
  // which is what the earlier pixel arithmetic got wrong: when the measurement
  // was missing the board collapsed and zooming changed nothing.
  const bodyTrack = useMemo(() => {
    const scale = zoom
    // An absolute floor keeps an hour usable on a short window; the percentage
    // is what makes zooming mean anything, because it is measured against the
    // board itself. `1fr` on top of both fills any space left over, so the
    // board is never short of the bottom of its own frame.
    const floorPx = Math.round(windowMinutes(timeWindow) * MIN_PX_PER_MINUTE * scale)
    if (scale === 1) return `minmax(${floorPx}px, 1fr)`
    return `minmax(max(${floorPx}px, ${Math.round(scale * 100)}%), 1fr)`
  }, [timeWindow, zoom])

  /** Lane ids the board is actually showing, minus the catch-all itself. */
  const knownLaneIds = useMemo(
    () => new Set(lanes.filter((lane) => !lane.isPlaceholder).map((lane) => lane.id)),
    [lanes]
  )

  const laneIdOf = useCallback(
    (job: WorkBoardJob) => laneIdForJob(job, grouping, knownLaneIds),
    [grouping, knownLaneIds]
  )

  const drag = useWeekDrag({
    window: timeWindow,
    snapMinutes,
    laneIdOf,
    onCommit: onSchedule,
  })

  useEffect(() => {
    if (!dropResolverRef) return
    dropResolverRef.current = drag.resolvePoint
    return () => {
      dropResolverRef.current = null
    }
  }, [dropResolverRef, drag.resolvePoint])

  // A job dragged in from the unassigned panel is under the cursor as an opaque
  // card, which says nothing about where it will actually land. This is the
  // block it would become, drawn snapped in the target column while the drag is
  // still in the air, from the same resolver the drop itself uses.
  const [dropGhost, setDropGhost] = useState<{
    key: string
    startMins: number
    endMins: number
  } | null>(null)

  const trackDropGhost = useCallback(
    (event: { activatorEvent: Event; delta: { x: number; y: number } }) => {
      const point = pointerFromDndEvent(event)
      const target = point ? drag.resolvePoint(point.x, point.y) : null
      if (!target || target.laneId === UNLANED) {
        setDropGhost(null)
        return
      }
      const endMins = Math.min(target.startMins + DEFAULT_JOB_MINUTES, timeWindow.endMins)
      setDropGhost({
        key: columnKey(target.date, target.laneId),
        startMins: target.startMins,
        endMins,
      })
    },
    [drag.resolvePoint, timeWindow.endMins]
  )

  useDndMonitor({
    onDragMove: trackDropGhost,
    onDragOver: trackDropGhost,
    onDragEnd: () => setDropGhost(null),
    onDragCancel: () => setDropGhost(null),
  })

  // While a job is being dragged it is laid out from the preview, so it moves
  // between lanes and days through exactly the same code that placed it.
  const displayed = useMemo(() => {
    const preview = drag.preview
    if (!preview) return scheduled
    return scheduled.map((job) => {
      if (job.id !== preview.jobId) return job
      const patch =
        grouping === 'technician'
          ? { technicianId: preview.laneId }
          : grouping === 'bay'
            ? { workBayId: preview.laneId }
            : {}
      return {
        ...job,
        ...patch,
        startDateTime: new Date(preview.startMs).toISOString(),
        endDateTime: new Date(preview.endMs).toISOString(),
      }
    })
  }, [scheduled, drag.preview, grouping])

  const byLane = useMemo(
    () => groupJobsByLane(displayed, grouping, knownLaneIds),
    [displayed, grouping, knownLaneIds]
  )

  const todayStr = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }, [])
  const nowMinutes = useNowMinutes()

  // Work booked on a day the board is not showing would otherwise vanish
  // without a word, which is worse than showing the day.
  const hiddenCount = useMemo(() => {
    if (!hiddenDays?.length) return 0
    return scheduled.filter((job) =>
      hiddenDays.some((day) => resolveJobOnDay(job, day, { startMins: 0, endMins: MINUTES_IN_DAY }))
    ).length
  }, [scheduled, hiddenDays])

  const slotMinutes = zoom >= FINE_SLOT_FROM_ZOOM ? 15 : 30
  const pan = useDragToPan(scrollRef)

  // Ctrl (or command) with the wheel zooms, which is the gesture every map and
  // canvas uses, and is what a trackpad pinch already sends. Without the
  // modifier the wheel scrolls the board as usual.
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onZoomChange) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const direction = event.deltaY < 0 ? 1 : -1
      const next = clampZoom(zoom * (1 + direction * ZOOM_STEP))
      if (next !== zoom) onZoomChange(next)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoom, onZoomChange])
  /** The week runs off the edge and there is a grouping that would fix it. */
  const overflowsWeek = (pan.overflow.left || pan.overflow.right) && grouping !== 'none'

  /** One day's worth of columns, so paging lands on a day boundary. */
  const dayWidth = useCallback(() => {
    const el = scrollRef.current
    if (!el || days.length === 0) return MIN_COLUMN_WIDTH * lanes.length
    return Math.max((el.scrollWidth - GUTTER_WIDTH) / days.length, MIN_COLUMN_WIDTH)
  }, [days.length, lanes.length])

  // With one column a day, nothing along the top says who a job belongs to, so
  // the block carries its owner's colour and name instead. This is what makes
  // the ungrouped week readable for a shop too big to give everyone a column.
  const ownerOf = useMemo(() => {
    if (grouping !== 'none' || !owners) return undefined
    return (job: WorkBoardJob) =>
      owners.get(job.technicianId ?? '') ?? owners.get(job.workBayId ?? '') ?? null
  }, [grouping, owners])

  const marks = useMemo(() => hourMarks(timeWindow), [timeWindow])

  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(${days.length * lanes.length}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`
  const gridTemplateRows = `${DAY_HEADER_HEIGHT}px ${showLaneHeaders ? `${LANE_HEADER_HEIGHT}px ` : ''}${bodyTrack}`

  // Open on the current time rather than at the top of the axis: a shop looking
  // at today wants the next hour, not the start of the shift.
  useEffect(() => {
    if (hasScrolled.current || !scrollRef.current) return
    if (!days.includes(todayStr) || nowMinutes === null) return
    hasScrolled.current = true
    const body = scrollRef.current.scrollHeight - scrollRef.current.clientHeight
    if (body <= 0) return
    const ratio = percentForMinutes(nowMinutes, timeWindow) / 100
    scrollRef.current.scrollTop = Math.max(0, scrollRef.current.scrollHeight * ratio - 120)
  }, [days, todayStr, nowMinutes, timeWindow])

  if (lanes.length === 0) return null

  const dayFormatter = new Intl.DateTimeFormat(locale || undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    // `min-w-0` is load-bearing: a flex item's automatic minimum size is its
    // content's, and this content is a grid eighty-five columns wide. Without
    // it the board refuses to shrink, and the unassigned panel beside it gets
    // pushed off the edge of the row instead.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <UnscheduledStrip jobs={unscheduled} onOpenJob={onOpenJob} />

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={onShowHiddenDays}
          className="self-start rounded-md border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted"
        >
          {t('hiddenDays', { count: hiddenCount })}
        </button>
      )}

      <div className="relative min-h-0 flex-1">
        {pan.overflow.left && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-0 z-40 w-10 rounded-l-md bg-linear-to-r from-background to-transparent"
            />
            <button
              type="button"
              data-pan-ignore
              aria-label={t('panLeft')}
              onClick={() => pan.panBy(-1, dayWidth())}
              className="absolute left-1 top-1/2 z-40 -translate-y-1/2 rounded-full border bg-background/95 p-1.5 shadow-md transition-colors hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </>
        )}
        {pan.overflow.right && (
          <>
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 right-0 z-40 w-10 rounded-r-md bg-linear-to-l from-background to-transparent"
            />
            <button
              type="button"
              data-pan-ignore
              aria-label={t('panRight')}
              onClick={() => pan.panBy(1, dayWidth())}
              className="absolute right-1 top-1/2 z-40 -translate-y-1/2 rounded-full border bg-background/95 p-1.5 shadow-md transition-colors hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        <div
          ref={scrollRef}
          className={cn(
            'relative h-full overflow-auto rounded-md border',
            pan.isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
          )}
        >
          <div
            className="grid h-full min-h-full min-w-full"
            style={{ gridTemplateColumns, gridTemplateRows }}
          >
            {/* Day headers */}
            <div
              className="sticky left-0 top-0 z-50 border-b border-r bg-background"
              style={{ height: DAY_HEADER_HEIGHT }}
            />
            {days.map((day) => {
              const isToday = day === todayStr
              return (
                <div
                  key={`day-${day}`}
                  className={cn(
                    'sticky top-0 z-40 border-b border-r bg-background px-2 py-1 text-center text-xs font-medium',
                    isToday && 'text-primary'
                  )}
                  style={{
                    gridColumn: `span ${lanes.length}`,
                    height: DAY_HEADER_HEIGHT,
                  }}
                >
                  {dayFormatter.format(new Date(`${day}T12:00:00`))}
                </div>
              )
            })}

            {/* Lane headers, repeated under each day so a column is readable
              wherever the board has been scrolled to. */}
            {showLaneHeaders && (
              <>
                <div
                  className="sticky left-0 z-50 border-b border-r bg-background"
                  style={{ top: DAY_HEADER_HEIGHT }}
                />
                {days.flatMap((day) =>
                  lanes.map((lane, laneIndex) => {
                    const isLastLane = laneIndex === lanes.length - 1
                    const booked = bookedMinutesOnDay(byLane.get(lane.id) ?? [], day)
                    const pct =
                      lane.dailyCapacity > 0
                        ? Math.round((booked / lane.dailyCapacity) * 100)
                        : null
                    return (
                      <LaneHeaderTooltip
                        key={`lane-${day}-${lane.id}`}
                        lane={lane}
                        jobs={byLane.get(lane.id) ?? []}
                        days={[day]}
                        capacityMinutes={lane.dailyCapacity}
                        periodLabel={dayFormatter.format(new Date(`${day}T12:00:00`))}
                      >
                        <button
                          type="button"
                          disabled={lane.isPlaceholder || readOnly || !onLaneClick}
                          onClick={() => onLaneClick?.(lane)}
                          className={cn(
                            'sticky z-40 flex flex-col justify-center gap-1 border-b bg-background px-1.5 text-left disabled:cursor-default',
                            isLastLane ? 'border-r-2 border-r-border' : 'border-r'
                          )}
                          style={{ top: DAY_HEADER_HEIGHT, height: LANE_HEADER_HEIGHT }}
                        >
                          <span className="flex items-center gap-1">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: lane.color }}
                            />
                            <span className="truncate text-[11px] font-medium">{lane.name}</span>
                          </span>
                          {pct !== null && (
                            <span className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
                              <span
                                className={cn(
                                  'block h-full rounded-full',
                                  pct > 100
                                    ? 'bg-red-500'
                                    : pct >= 75
                                      ? 'bg-amber-500'
                                      : 'bg-emerald-500'
                                )}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </span>
                          )}
                        </button>
                      </LaneHeaderTooltip>
                    )
                  })
                )}
              </>
            )}

            {/* Time gutter */}
            <div className="relative sticky left-0 z-30 border-r bg-background">
              {marks.map((mins) => (
                <span
                  key={mins}
                  className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                  style={{ top: `${percentForMinutes(mins, timeWindow)}%` }}
                >
                  {formatClock(mins, timeFormat)}
                </span>
              ))}
            </div>

            {days.flatMap((day) =>
              lanes.map((lane, laneIndex) => (
                <WeekLaneColumn
                  key={`col-${day}-${lane.id}`}
                  date={day}
                  lane={lane}
                  endsDay={laneIndex === lanes.length - 1}
                  dropGhost={dropGhost?.key === columnKey(day, lane.id) ? dropGhost : null}
                  jobs={byLane.get(lane.id) ?? []}
                  window={timeWindow}
                  slotMinutes={slotMinutes}
                  timeFormat={timeFormat}
                  ownerOf={ownerOf}
                  lookup={owners}
                  workDayStart={dayStartMins}
                  workDayEnd={dayEndMins}
                  nowMinutes={day === todayStr ? nowMinutes : null}
                  draggingJobId={drag.isDragging ? (drag.preview?.jobId ?? null) : null}
                  registerColumn={drag.registerColumn}
                  readOnly={readOnly}
                  onOpenJob={onOpenJob}
                  onDragHandle={drag.startDrag}
                  onCreateJob={lane.isPlaceholder || readOnly ? undefined : onCreateJob}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {!readOnly && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted-foreground">
          <span>
            {t('hint')}
            {(pan.overflow.left || pan.overflow.right) && ` ${t('hintPan')}`}
            {onZoomChange && ` ${t('hintZoom')}`}
          </span>
          {/* The question this view kept prompting was "how do I see the whole
              week", and the answer was buried in a dropdown. It is a button
              now, and it only shows up when the week does not already fit. */}
          {overflowsWeek && onShowWholeWeek && (
            <button
              type="button"
              onClick={onShowWholeWeek}
              className="rounded border border-dashed px-1.5 py-0.5 font-medium text-foreground transition-colors hover:bg-muted"
            >
              {t('wholeWeek')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Minutes since midnight, refreshed often enough for the "now" line to creep.
 *
 * Starts null so the server-rendered board and the first client render agree;
 * the clock only exists once the page is live.
 */
function useNowMinutes(): number | null {
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setMinutes(now.getHours() * 60 + now.getMinutes())
    }
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [])

  return minutes
}
