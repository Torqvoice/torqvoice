'use client'

import { memo, useCallback, useMemo, useRef } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { WorkBoardJob } from '../../Actions/boardActions'
import { type ClockFormat, formatClock } from '../../utils/clock'
import { type BoardLane, isHelperLane } from '../../utils/lanes'
import { type TimeWindow, layoutLaneDay } from '../../utils/layout'
import { columnKey, minutesAtPoint, percentForMinutes, percentForSpan } from './geometry'
import { WeekJobBlock } from './WeekJobBlock'
import type { WeekDragMode } from './useWeekDrag'
import type { BoardAway, BoardClosed } from '../../hooks/useBoardCalendar'
import type { MinuteSpan } from '@/features/workshop-calendar/Lib/boardDays'

/** Blocks thinner than this are unreadable, so short jobs get a floor. */
const MIN_BLOCK_HEIGHT = 14

function WeekLaneColumnImpl({
  date,
  lane,
  endsDay,
  dropGhost,
  jobs,
  window: timeWindow,
  slotMinutes,
  timeFormat,
  ownerOf,
  lookup,
  workDayStart,
  workDayEnd,
  closed,
  away,
  nowMinutes,
  readOnly,
  draggingJobId,
  registerColumn,
  onOpenJob,
  onDragHandle,
  onCreateJob,
}: {
  date: string
  lane: BoardLane
  /** Last lane of its day, which gets the heavier rule between days. */
  endsDay: boolean
  /** Where a job dragged in from outside would land, while it is still in the air. */
  dropGhost?: { startMins: number; endMins: number } | null
  jobs: WorkBoardJob[]
  window: TimeWindow
  slotMinutes: number
  timeFormat: ClockFormat
  /** Set when the lane column does not name the owner, so the block must. */
  ownerOf?: (job: WorkBoardJob) => { name: string; color: string } | null
  /** Technicians and bays by id, for naming both in a job's tooltip. */
  lookup?: Map<string, { name: string; color: string }>
  workDayStart: number
  workDayEnd: number
  /**
   * When the workshop is closed that day, from its calendar. When given it
   * replaces the shading worked out from the work day above.
   */
  closed?: BoardClosed
  /** When this lane's technician is away that day. */
  away?: BoardAway
  /** Minutes from midnight to draw the "now" line at, or null on other days. */
  nowMinutes: number | null
  readOnly?: boolean
  draggingJobId: string | null
  registerColumn: (key: string, el: HTMLElement | null) => void
  onOpenJob: (job: WorkBoardJob) => void
  onDragHandle: (event: React.PointerEvent, job: WorkBoardJob, mode: WeekDragMode) => void
  onCreateJob?: (lane: BoardLane, date: string, startMins: number) => void
}) {
  const t = useTranslations('workBoard.week')
  const key = columnKey(date, lane.id)
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const contextMinutes = useRef(timeWindow.startMins)

  const { isOver, setNodeRef } = useDroppable({
    id: `week::${key}`,
    data: { laneId: lane.id, date, week: true },
  })

  const attachRef = useCallback(
    (el: HTMLDivElement | null) => {
      bodyRef.current = el
      setNodeRef(el)
      registerColumn(key, el)
    },
    [key, registerColumn, setNodeRef]
  )

  const positioned = useMemo(() => layoutLaneDay(jobs, date, timeWindow), [jobs, date, timeWindow])

  // Rules as two stacked gradients rather than one element per slot. A shop
  // with fifteen technicians draws seventy-five of these columns; at thirty
  // elements each that was two thousand nodes of pure decoration, re-rendered
  // on every frame of a drag. The stops are percentages, so they follow the
  // column however tall CSS decides it should be.
  const rules = useMemo(() => {
    const hour = percentForSpan(60, timeWindow)
    const slot = percentForSpan(slotMinutes, timeWindow)
    return {
      backgroundImage: [
        `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${hour}%)`,
        `repeating-linear-gradient(to bottom, color-mix(in oklch, var(--border) 45%, transparent) 0 1px, transparent 1px ${slot}%)`,
      ].join(', '),
    }
  }, [timeWindow, slotMinutes])

  /** Hours outside the shop's working day, shaded top and bottom. */
  const closedBefore = percentForSpan(Math.max(workDayStart - timeWindow.startMins, 0), timeWindow)
  const closedAfter = percentForSpan(Math.max(timeWindow.endMins - workDayEnd, 0), timeWindow)

  /** A span of the day as a top offset and height inside the visible window. */
  const place = (span: MinuteSpan) => {
    const from = Math.max(span.startMins, timeWindow.startMins)
    const to = Math.min(span.endMins, timeWindow.endMins)
    if (to <= from) return null
    return {
      top: `${percentForMinutes(from, timeWindow)}%`,
      height: `${percentForSpan(to - from, timeWindow)}%`,
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!onCreateJob}>
        <div
          ref={attachRef}
          className={cn(
            'relative',
            // A heavier rule between days and a light one between lanes, so a
            // week of columns still reads as five days at a glance.
            endsDay ? 'border-r-2 border-r-border' : 'border-r border-r-border/50',
            nowMinutes !== null && 'bg-primary/[0.03]',
            isOver && 'bg-primary/10'
          )}
          onContextMenu={(event) => {
            const rect = bodyRef.current?.getBoundingClientRect()
            if (!rect) return
            const raw = minutesAtPoint(event.clientY, rect, timeWindow)
            contextMinutes.current = Math.max(
              timeWindow.startMins,
              Math.min(
                Math.round(raw / slotMinutes) * slotMinutes,
                timeWindow.endMins - slotMinutes
              )
            )
          }}
        >
          <div aria-hidden className="absolute inset-0" style={rules} />
          {closed ? (
            <>
              {closed.spans.map((span) => {
                const at = place(span)
                return at ? (
                  <div
                    key={`closed-${span.startMins}`}
                    aria-hidden
                    className={cn(
                      'absolute inset-x-0',
                      closed.allDay ? 'bg-muted/70' : 'bg-muted/40'
                    )}
                    style={at}
                  />
                ) : null
              })}
              {/* A holiday or closure is darker than the hours the shop is
                  simply shut, so a short day reads as one at a glance. */}
              {!closed.allDay &&
                closed.closureSpans.map((span) => {
                  const at = place(span)
                  return at ? (
                    <div
                      key={`closure-${span.startMins}`}
                      aria-hidden
                      className="absolute inset-x-0 bg-muted/50"
                      style={at}
                      data-testid="closure-span"
                    />
                  ) : null
                })}
            </>
          ) : (
            <>
              {closedBefore > 0 && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 bg-muted/40"
                  style={{ height: `${closedBefore}%` }}
                />
              )}
              {closedAfter > 0 && (
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 bg-muted/40"
                  style={{ height: `${closedAfter}%` }}
                />
              )}
            </>
          )}
          {away?.spans.map((span) => {
            const at = place(span)
            return at ? (
              <div
                key={`away-${span.startMins}`}
                className="pointer-events-none absolute inset-x-0 z-10 overflow-hidden border-y border-dashed border-muted-foreground/40"
                style={{
                  ...at,
                  backgroundImage:
                    'repeating-linear-gradient(135deg, color-mix(in oklch, var(--muted-foreground) 18%, transparent) 0 6px, transparent 6px 12px)',
                }}
                data-testid="away-span"
              >
                <span className="block truncate px-1 pt-0.5 text-[10px] font-medium text-muted-foreground">
                  {away.label}
                </span>
              </div>
            ) : null
          })}

          {nowMinutes !== null && <NowLine minutes={nowMinutes} window={timeWindow} />}

          {dropGhost && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0.5 z-20 flex items-start justify-center overflow-hidden rounded-md border-2 border-dashed border-primary bg-primary/15"
              style={{
                top: `${percentForMinutes(dropGhost.startMins, timeWindow)}%`,
                height: `${percentForSpan(dropGhost.endMins - dropGhost.startMins, timeWindow)}%`,
                minHeight: MIN_BLOCK_HEIGHT,
              }}
            >
              <span className="truncate px-1 text-[10px] font-semibold tabular-nums text-primary">
                {formatClock(dropGhost.startMins, timeFormat)}
              </span>
            </div>
          )}

          {positioned.map((item) => (
            <WeekJobBlock
              key={item.job.id}
              positioned={item}
              window={timeWindow}
              isDragging={draggingJobId === item.job.id}
              readOnly={readOnly}
              timeFormat={timeFormat}
              laneColor={lane.color}
              owner={ownerOf?.(item.job) ?? null}
              technician={
                item.job.technicianId ? (lookup?.get(item.job.technicianId) ?? null) : null
              }
              helperNames={item.job.helperIds
                .map((id) => lookup?.get(id)?.name)
                .filter((name): name is string => !!name)}
              // In this lane because its technician is helping, not because
              // the job is theirs.
              shadow={isHelperLane(item.job, lane.id, lane.grouping)}
              bayName={item.job.workBayId ? (lookup?.get(item.job.workBayId)?.name ?? null) : null}
              onOpen={onOpenJob}
              onDragHandle={onDragHandle}
            />
          ))}
        </div>
      </ContextMenuTrigger>
      {onCreateJob && (
        <ContextMenuContent>
          <ContextMenuItem onClick={() => onCreateJob(lane, date, contextMinutes.current)}>
            <Plus className="mr-2 h-4 w-4" />
            {t('createAt', { time: formatClock(contextMinutes.current, timeFormat) })}
          </ContextMenuItem>
        </ContextMenuContent>
      )}
    </ContextMenu>
  )
}

/**
 * The current time, drawn in every column of today so the line reads straight
 * across the day rather than stopping at one lane.
 */
function NowLine({ minutes, window: timeWindow }: { minutes: number; window: TimeWindow }) {
  if (minutes < timeWindow.startMins || minutes > timeWindow.endMins) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 h-px bg-red-500"
      style={{ top: `${percentForMinutes(minutes, timeWindow)}%` }}
    />
  )
}

/**
 * A week is up to eighty-five of these, and the parent re-renders on every
 * frame of a drag to move one ghost. Without this, all of them re-laid-out
 * their jobs to redraw a dashed rectangle in one of them.
 */
export const WeekLaneColumn = memo(WeekLaneColumnImpl)
