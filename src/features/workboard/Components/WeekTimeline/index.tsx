'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDndMonitor } from '@dnd-kit/core'
import { useLocale, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { useDateSettings } from '@/components/date-settings-context'
import type { WorkBoardJob } from '../../Actions/boardActions'
import type { BoardDensity } from '../../hooks/useBoardPreferences'
import { DENSITY_SCALE } from '../../hooks/useBoardPreferences'
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
import { formatDuration } from '../DurationSlider'
import { UnscheduledStrip } from './UnscheduledStrip'
import { WeekLaneColumn } from './WeekLaneColumn'
import {
  DEFAULT_JOB_MINUTES,
  columnKey,
  offsetForMinutes,
  pointerFromDndEvent,
  totalHeight,
} from './geometry'
import { type WeekDropTarget, useWeekDrag } from './useWeekDrag'

/** Candidate rules, finest first. The first one with room to breathe wins. */
const SLOT_STEPS = [15, 30, 60]
/** A rule closer than this to the next just makes the board look hatched. */
const MIN_SLOT_PIXELS = 11

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
/** Used for the first paint, before the board has been measured. */
const FALLBACK_PX_PER_MINUTE = 1

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
  density,
  snapMinutes,
  workDayStart,
  workDayEnd,
  dropResolverRef,
  onOpenJob,
  onSchedule,
  onCreateJob,
  onLaneClick,
  onShowHiddenDays,
  readOnly = false,
}: {
  days: string[]
  /** Days left out of the grid, so work on them can still be accounted for. */
  hiddenDays?: string[]
  lanes: BoardLane[]
  jobs: WorkBoardJob[]
  grouping: LaneGrouping
  density: BoardDensity
  snapMinutes: number
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

  // The board is sized by the window, not by the clock: whatever height the
  // page gives it is divided among the hours it has to show. `fit` therefore
  // fills the board exactly and the wider settings scale up from there, so no
  // screen ends with an empty half underneath the last hour.
  const boardHeight = useMeasuredHeight(scrollRef)
  const pxPerMinute = useMemo(() => {
    const totalMinutes = Math.max(timeWindow.endMins - timeWindow.startMins, 1)
    if (boardHeight === null) return FALLBACK_PX_PER_MINUTE * DENSITY_SCALE[density]
    const headers = DAY_HEADER_HEIGHT + (showLaneHeaders ? LANE_HEADER_HEIGHT : 0)
    // One pixel back, so an exact fit cannot round into a scrollbar.
    const fit = Math.max(boardHeight - headers - 1, 60) / totalMinutes
    return Math.max(fit * DENSITY_SCALE[density], MIN_PX_PER_MINUTE)
  }, [boardHeight, density, timeWindow, showLaneHeaders])

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
    pxPerMinute,
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

  const slotMinutes = useMemo(
    () => SLOT_STEPS.find((step) => step * pxPerMinute >= MIN_SLOT_PIXELS) ?? 60,
    [pxPerMinute]
  )

  const marks = useMemo(() => hourMarks(timeWindow), [timeWindow])
  const bodyHeight = totalHeight(timeWindow, pxPerMinute)

  const gridTemplateColumns = `${GUTTER_WIDTH}px repeat(${days.length * lanes.length}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`

  // Open on the current time rather than at the top of the axis: a shop looking
  // at today wants the next hour, not the start of the shift.
  useEffect(() => {
    if (hasScrolled.current || !scrollRef.current) return
    if (!days.includes(todayStr) || nowMinutes === null) return
    hasScrolled.current = true
    const target = offsetForMinutes(nowMinutes, timeWindow, pxPerMinute) - 120
    scrollRef.current.scrollTop = Math.max(0, target)
  }, [days, todayStr, nowMinutes, timeWindow, pxPerMinute])

  if (lanes.length === 0) return null

  const dayFormatter = new Intl.DateTimeFormat(locale || undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
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

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto rounded-md border">
        <div className="grid min-w-full" style={{ gridTemplateColumns }}>
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
                    lane.dailyCapacity > 0 ? Math.round((booked / lane.dailyCapacity) * 100) : null
                  return (
                    <button
                      key={`lane-${day}-${lane.id}`}
                      type="button"
                      disabled={lane.isPlaceholder || readOnly || !onLaneClick}
                      onClick={() => onLaneClick?.(lane)}
                      className={cn(
                        'sticky z-40 flex flex-col justify-center gap-1 border-b bg-background px-1.5 text-left disabled:cursor-default',
                        isLastLane ? 'border-r-2 border-r-border' : 'border-r'
                      )}
                      style={{ top: DAY_HEADER_HEIGHT, height: LANE_HEADER_HEIGHT }}
                      title={
                        pct === null
                          ? lane.name
                          : `${lane.name} · ${formatDuration(booked)} / ${formatDuration(lane.dailyCapacity)}`
                      }
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
                  )
                })
              )}
            </>
          )}

          {/* Time gutter */}
          <div className="sticky left-0 z-30 border-r bg-background" style={{ height: bodyHeight }}>
            {marks.map((mins) => (
              <span
                key={mins}
                className="absolute right-1 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: offsetForMinutes(mins, timeWindow, pxPerMinute) }}
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
                pxPerMinute={pxPerMinute}
                slotMinutes={slotMinutes}
                timeFormat={timeFormat}
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

      {!readOnly && <p className="px-1 text-[11px] text-muted-foreground">{t('hint')}</p>}
    </div>
  )
}

/**
 * The height the page has given an element, or null before it is laid out.
 *
 * The element must be able to overflow (a `flex-1 min-h-0` box with its own
 * scrollbar), otherwise the content it sizes would feed back into the
 * measurement and the two would chase each other.
 */
function useMeasuredHeight(ref: React.RefObject<HTMLElement | null>): number | null {
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const apply = (next: number) => {
      setHeight((current) => (current === null || Math.abs(current - next) > 1 ? next : current))
    }
    apply(el.clientHeight)

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box) apply(box.height)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return height
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
