'use client'

import { useCallback, useMemo, useRef } from 'react'
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
import { minutesToTime } from '../../utils/datetime'
import type { BoardLane } from '../../utils/lanes'
import { type TimeWindow, layoutLaneDay } from '../../utils/layout'
import { columnKey, offsetForMinutes } from './geometry'
import { WeekJobBlock } from './WeekJobBlock'
import type { WeekDragMode } from './useWeekDrag'

/** Blocks thinner than this are unreadable, so short jobs get a floor. */
const MIN_BLOCK_HEIGHT = 14

export function WeekLaneColumn({
  date,
  lane,
  jobs,
  window: timeWindow,
  pxPerMinute,
  slotMinutes,
  workDayStart,
  workDayEnd,
  nowMinutes,
  draggingJobId,
  registerColumn,
  onOpenJob,
  onDragHandle,
  onCreateJob,
}: {
  date: string
  lane: BoardLane
  jobs: WorkBoardJob[]
  window: TimeWindow
  pxPerMinute: number
  slotMinutes: number
  workDayStart: number
  workDayEnd: number
  /** Minutes from midnight to draw the "now" line at, or null on other days. */
  nowMinutes: number | null
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

  const slots = useMemo(() => {
    const marks: number[] = []
    for (let m = timeWindow.startMins; m < timeWindow.endMins; m += slotMinutes) {
      marks.push(m)
    }
    return marks
  }, [timeWindow, slotMinutes])

  const height = (timeWindow.endMins - timeWindow.startMins) * pxPerMinute

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={!onCreateJob}>
        <div
          ref={attachRef}
          className={cn(
            'relative border-r border-border/60 last:border-r-0',
            nowMinutes !== null && 'bg-primary/[0.03]',
            isOver && 'bg-primary/10'
          )}
          style={{ height }}
          onContextMenu={(event) => {
            const rect = bodyRef.current?.getBoundingClientRect()
            if (!rect) return
            const raw = timeWindow.startMins + (event.clientY - rect.top) / pxPerMinute
            contextMinutes.current = Math.max(
              timeWindow.startMins,
              Math.min(
                Math.round(raw / slotMinutes) * slotMinutes,
                timeWindow.endMins - slotMinutes
              )
            )
          }}
        >
          {slots.map((mins) => {
            const outsideHours = mins < workDayStart || mins >= workDayEnd
            return (
              <div
                key={mins}
                aria-hidden
                className={cn(
                  'absolute inset-x-0 border-t',
                  mins % 60 === 0 ? 'border-border/70' : 'border-border/30 border-dashed',
                  outsideHours && 'bg-muted/40'
                )}
                style={{
                  top: offsetForMinutes(mins, timeWindow, pxPerMinute),
                  height: slotMinutes * pxPerMinute,
                }}
              />
            )
          })}

          {nowMinutes !== null && (
            <NowLine minutes={nowMinutes} window={timeWindow} pxPerMinute={pxPerMinute} />
          )}

          {positioned.map((item) => (
            <WeekJobBlock
              key={item.job.id}
              positioned={item}
              top={offsetForMinutes(item.startMins, timeWindow, pxPerMinute)}
              height={Math.max((item.endMins - item.startMins) * pxPerMinute, MIN_BLOCK_HEIGHT)}
              isDragging={draggingJobId === item.job.id}
              laneColor={lane.color}
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
            {t('createAt', { time: minutesToTime(contextMinutes.current) })}
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
function NowLine({
  minutes,
  window: timeWindow,
  pxPerMinute,
}: {
  minutes: number
  window: TimeWindow
  pxPerMinute: number
}) {
  if (minutes < timeWindow.startMins || minutes > timeWindow.endMins) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 z-20 h-px bg-red-500"
      style={{ top: offsetForMinutes(minutes, timeWindow, pxPerMinute) }}
    />
  )
}
