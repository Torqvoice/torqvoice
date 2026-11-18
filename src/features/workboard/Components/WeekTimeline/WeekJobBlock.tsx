'use client'

import { useRef } from 'react'
import { ChevronDown, ChevronUp, ClipboardCheck, Users, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import type { WorkBoardJob } from '../../Actions/boardActions'
import { type ClockFormat, formatClockRange } from '../../utils/clock'
import { JobTooltip } from '../JobTooltip'
import { PromiseOverdueMark } from '../PromiseOverdueMark'
import { statusBlockColor } from '../../utils/job-colors'
import type { PositionedJob, TimeWindow } from '../../utils/layout'
import { percentForMinutes, percentForSpan } from './geometry'
import type { WeekDragMode } from './useWeekDrag'

/**
 * How much a block says, decided by how long the job is rather than by how many
 * pixels tall it came out. Duration is data and is known before anything is
 * laid out; pixels are not, and asking for them was what made the board depend
 * on a measurement that could arrive wrong or not at all.
 */
const VEHICLE_FROM_MINUTES = 25
const TIMES_FROM_MINUTES = 75
/** Short jobs still get a floor, so a 15-minute block is clickable. */
const MIN_BLOCK_HEIGHT = 14

export function WeekJobBlock({
  positioned,
  window: timeWindow,
  isDragging,
  readOnly,
  timeFormat,
  laneColor,
  owner,
  technician,
  helperNames = [],
  shadow = false,
  bayName,
  onOpen,
  onDragHandle,
}: {
  positioned: PositionedJob
  window: TimeWindow
  isDragging: boolean
  readOnly?: boolean
  timeFormat: ClockFormat
  laneColor: string
  /** Who the job belongs to, when the column itself does not say. */
  owner?: { name: string; color: string } | null
  /** Named in the tooltip whatever the columns are grouped by. */
  technician?: { name: string; color: string } | null
  /** Everybody else on the job with that technician. */
  helperNames?: string[]
  /**
   * The job as it sits in a helper's day: the same work, in the same hours,
   * but somebody else's to move. Drawn as an outline that opens the job and
   * cannot be dragged, so the one card that reschedules the job stays the
   * technician's.
   */
  shadow?: boolean
  bayName?: string | null
  onOpen: (job: WorkBoardJob) => void
  onDragHandle: (event: React.PointerEvent, job: WorkBoardJob, mode: WeekDragMode) => void
}) {
  const t = useTranslations('workBoard.job')
  const { job, column, columns, continuesBefore, continuesAfter } = positioned
  // A shadow is looked at, never picked up.
  const fixed = readOnly || shadow
  const withLabel = shadow
    ? technician
      ? t('with', { name: technician.name })
      : t('helping')
    : null
  const width = 100 / columns
  const durationMinutes = positioned.endMins - positioned.startMins
  const isServiceRecord = job.type === 'serviceRecord'
  const timeLabel = formatClockRange(positioned.startMins, positioned.endMins, timeFormat)
  const vehicleLabel = job.vehicle
    ? job.vehicle.licensePlate || `${job.vehicle.make} ${job.vehicle.model}`
    : null

  const pressOrigin = useRef<{ x: number; y: number } | null>(null)

  const pressStart = (event: React.PointerEvent) => {
    if (fixed) return
    pressOrigin.current = { x: event.clientX, y: event.clientY }
    // A job carried in from another day is only a view of work that starts
    // elsewhere; moving it from here would silently reschedule that day too.
    if (continuesBefore) return
    onDragHandle(event, job, 'move')
  }

  return (
    <JobTooltip
      job={job}
      timeFormat={timeFormat}
      ownerName={technician?.name}
      ownerColor={technician?.color}
      helperNames={helperNames}
      bayName={bayName}
    >
      <div
        role="button"
        tabIndex={0}
        // The board pans when the background is dragged; a job owns its own drag.
        data-pan-ignore
        aria-label={[timeLabel, job.title, withLabel].filter(Boolean).join(' ')}
        data-testid={shadow ? 'job-shadow' : undefined}
        className={cn(
          // A container, so what the block says can depend on how wide it
          // came out: fifteen technicians across a week leaves a sliver.
          'group @container absolute overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-tight select-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          // An outline in the page's own colours, where the job itself is a
          // solid block in its status colour: the eye reads the solid one as
          // the job and the outline as its echo.
          shadow
            ? 'border-dashed border-foreground/40 bg-background/80 text-foreground'
            : cn('border-black/10 shadow-sm', statusBlockColor(job.status)),
          continuesBefore && 'rounded-t-none border-t-dashed',
          continuesAfter && 'rounded-b-none border-b-dashed',
          isDragging ? 'z-20 opacity-90 ring-2 ring-primary' : 'z-10',
          readOnly
            ? 'cursor-default'
            : shadow || continuesBefore
              ? 'cursor-pointer'
              : 'cursor-grab active:cursor-grabbing'
        )}
        style={{
          top: `${percentForMinutes(positioned.startMins, timeWindow)}%`,
          height: `${percentForSpan(durationMinutes, timeWindow)}%`,
          minHeight: MIN_BLOCK_HEIGHT,
          left: `calc(${column * width}% + 1px)`,
          width: `calc(${width}% - 2px)`,
          // A shadow wears the technician's colour, not the lane's: the
          // stripe says whose job this is, in the day of somebody helping.
          borderLeft: shadow
            ? `3px dashed ${technician?.color ?? laneColor}`
            : `3px solid ${owner?.color ?? laneColor}`,
          touchAction: 'none',
        }}
        onPointerDown={pressStart}
        onClick={(event) => {
          // A release that travelled is the end of a drag, not a click on the job.
          const origin = pressOrigin.current
          pressOrigin.current = null
          if (origin) {
            const travelled =
              Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y)
            if (travelled > 4) return
          }
          onOpen(job)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen(job)
          }
        }}
      >
        {!continuesBefore && !fixed && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/15"
            onPointerDown={(event) => {
              event.stopPropagation()
              onDragHandle(event, job, 'resize-start')
            }}
          />
        )}

        {isDragging ? (
          // Mid-drag the block is the only readout of where it will land, so the
          // snapped time replaces the description entirely.
          <div className="pointer-events-none flex h-full items-start gap-1 font-semibold tabular-nums">
            <span className="truncate">{timeLabel}</span>
          </div>
        ) : (
          <div className="pointer-events-none flex items-start gap-1">
            {continuesBefore ? (
              <ChevronUp className="mt-px h-3 w-3 shrink-0 opacity-70" />
            ) : shadow ? (
              <Users className="mt-px h-3 w-3 shrink-0 opacity-80" />
            ) : isServiceRecord ? (
              <Wrench className="mt-px h-3 w-3 shrink-0 opacity-80" />
            ) : (
              <ClipboardCheck className="mt-px h-3 w-3 shrink-0 opacity-80" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate font-medium">{job.title}</span>
                {/* More than one person on it, said on the job's own block:
                    grouped by bay or not at all, nothing else on the board
                    would. The tooltip names them. Left out on a block too
                    narrow to hold it beside any of the title. */}
                {!shadow && helperNames.length > 0 && (
                  <span
                    className="hidden shrink-0 rounded-sm bg-black/15 px-1 text-[10px] font-semibold tabular-nums @[5rem]:inline"
                    data-testid="job-team-count"
                  >
                    +{helperNames.length}
                  </span>
                )}
                <PromiseOverdueMark job={job} compact className="shrink-0 px-0.5 py-0" />
              </div>
              {withLabel && <div className="truncate font-medium opacity-90">{withLabel}</div>}
              {owner && !shadow && (
                <div className="truncate font-medium opacity-90">{owner.name}</div>
              )}
              {durationMinutes >= VEHICLE_FROM_MINUTES && vehicleLabel && (
                <div className="truncate opacity-80">{vehicleLabel}</div>
              )}
              {durationMinutes >= TIMES_FROM_MINUTES && (
                <div className="truncate tabular-nums opacity-70">{timeLabel}</div>
              )}
            </div>
            {continuesAfter && <ChevronDown className="mt-px h-3 w-3 shrink-0 opacity-70" />}
          </div>
        )}

        {!continuesAfter && !fixed && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-20 h-1.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/15"
            onPointerDown={(event) => {
              event.stopPropagation()
              onDragHandle(event, job, 'resize-end')
            }}
          />
        )}
      </div>
    </JobTooltip>
  )
}
