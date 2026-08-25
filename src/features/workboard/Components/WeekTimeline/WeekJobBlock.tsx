'use client'

import { useRef } from 'react'
import { ChevronDown, ChevronUp, ClipboardCheck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkBoardJob } from '../../Actions/boardActions'
import { type ClockFormat, formatClockRange } from '../../utils/clock'
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
  onOpen,
  onDragHandle,
}: {
  positioned: PositionedJob
  window: TimeWindow
  isDragging: boolean
  readOnly?: boolean
  timeFormat: ClockFormat
  laneColor: string
  onOpen: (job: WorkBoardJob) => void
  onDragHandle: (event: React.PointerEvent, job: WorkBoardJob, mode: WeekDragMode) => void
}) {
  const { job, column, columns, continuesBefore, continuesAfter } = positioned
  const width = 100 / columns
  const durationMinutes = positioned.endMins - positioned.startMins
  const isServiceRecord = job.type === 'serviceRecord'
  const timeLabel = formatClockRange(positioned.startMins, positioned.endMins, timeFormat)
  const vehicleLabel = job.vehicle
    ? job.vehicle.licensePlate || `${job.vehicle.make} ${job.vehicle.model}`
    : null

  const pressOrigin = useRef<{ x: number; y: number } | null>(null)

  const pressStart = (event: React.PointerEvent) => {
    if (readOnly) return
    pressOrigin.current = { x: event.clientX, y: event.clientY }
    // A job carried in from another day is only a view of work that starts
    // elsewhere; moving it from here would silently reschedule that day too.
    if (continuesBefore) return
    onDragHandle(event, job, 'move')
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${timeLabel} ${job.title}`}
      title={`${timeLabel} · ${job.title}${vehicleLabel ? ` · ${vehicleLabel}` : ''}`}
      className={cn(
        'group absolute overflow-hidden rounded-md border border-black/10 px-1.5 py-0.5 text-[11px] leading-tight shadow-sm select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        statusBlockColor(job.status),
        continuesBefore && 'rounded-t-none border-t-dashed',
        continuesAfter && 'rounded-b-none border-b-dashed',
        isDragging ? 'z-20 opacity-90 ring-2 ring-primary' : 'z-10',
        readOnly
          ? 'cursor-default'
          : continuesBefore
            ? 'cursor-pointer'
            : 'cursor-grab active:cursor-grabbing'
      )}
      style={{
        top: `${percentForMinutes(positioned.startMins, timeWindow)}%`,
        height: `${percentForSpan(durationMinutes, timeWindow)}%`,
        minHeight: MIN_BLOCK_HEIGHT,
        left: `calc(${column * width}% + 1px)`,
        width: `calc(${width}% - 2px)`,
        borderLeft: `3px solid ${laneColor}`,
        touchAction: 'none',
      }}
      onPointerDown={pressStart}
      onClick={(event) => {
        // A release that travelled is the end of a drag, not a click on the job.
        const origin = pressOrigin.current
        pressOrigin.current = null
        if (origin) {
          const travelled = Math.abs(event.clientX - origin.x) + Math.abs(event.clientY - origin.y)
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
      {!continuesBefore && !readOnly && (
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
          ) : isServiceRecord ? (
            <Wrench className="mt-px h-3 w-3 shrink-0 opacity-80" />
          ) : (
            <ClipboardCheck className="mt-px h-3 w-3 shrink-0 opacity-80" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{job.title}</div>
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

      {!continuesAfter && !readOnly && (
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
  )
}
