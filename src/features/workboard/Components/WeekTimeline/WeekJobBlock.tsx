'use client'

import { useRef } from 'react'
import { ChevronDown, ChevronUp, ClipboardCheck, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkBoardJob } from '../../Actions/boardActions'
import { minutesToTime } from '../../utils/datetime'
import { statusBlockColor } from '../../utils/job-colors'
import type { PositionedJob } from '../../utils/layout'
import type { WeekDragMode } from './useWeekDrag'

/** Below this height there is only room for one line of text. */
const TERSE_HEIGHT = 34
/** Below this, not even that. */
const BARE_HEIGHT = 18

export function WeekJobBlock({
  positioned,
  top,
  height,
  isDragging,
  laneColor,
  onOpen,
  onDragHandle,
}: {
  positioned: PositionedJob
  top: number
  height: number
  isDragging: boolean
  laneColor: string
  onOpen: (job: WorkBoardJob) => void
  onDragHandle: (event: React.PointerEvent, job: WorkBoardJob, mode: WeekDragMode) => void
}) {
  const { job, column, columns, continuesBefore, continuesAfter } = positioned
  const width = 100 / columns
  const isServiceRecord = job.type === 'serviceRecord'
  const timeLabel = `${minutesToTime(positioned.startMins)} – ${minutesToTime(positioned.endMins)}`
  const vehicleLabel = job.vehicle
    ? job.vehicle.licensePlate || `${job.vehicle.make} ${job.vehicle.model}`
    : null

  const pressOrigin = useRef<{ x: number; y: number } | null>(null)

  const pressStart = (event: React.PointerEvent) => {
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
        continuesBefore ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'
      )}
      style={{
        top,
        height,
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
      {!continuesBefore && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/15"
          onPointerDown={(event) => {
            event.stopPropagation()
            onDragHandle(event, job, 'resize-start')
          }}
        />
      )}

      {height >= BARE_HEIGHT && (
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
            {height >= TERSE_HEIGHT && vehicleLabel && (
              <div className="truncate opacity-80">{vehicleLabel}</div>
            )}
            {height >= TERSE_HEIGHT * 2 && (
              <div className="truncate tabular-nums opacity-70">{timeLabel}</div>
            )}
          </div>
          {continuesAfter && <ChevronDown className="mt-px h-3 w-3 shrink-0 opacity-70" />}
        </div>
      )}

      {!continuesAfter && (
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
