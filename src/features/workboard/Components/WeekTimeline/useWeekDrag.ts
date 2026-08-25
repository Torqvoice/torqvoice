'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { WorkBoardJob } from '../../Actions/boardActions'
import type { TimeWindow } from '../../utils/layout'
import { dayStartDate } from '../../utils/layout'
import { minutesAtPoint, parseColumnKey } from './geometry'

export type WeekDragMode = 'move' | 'resize-start' | 'resize-end'

/** Where a dragged job would land if the pointer were released now. */
export type WeekDragPreview = {
  jobId: string
  startMs: number
  endMs: number
  laneId: string
}

export type WeekDropTarget = {
  date: string
  laneId: string
  /** Minutes from midnight, already snapped. */
  startMins: number
}

type ActiveDrag = {
  jobId: string
  mode: WeekDragMode
  origStartMs: number
  origEndMs: number
  origLaneId: string
  anchorX: number
  anchorY: number
  holdTimer?: number
}

/** Movement, in pixels, before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4
/** How long a finger must rest on a job before it starts moving it. */
const TOUCH_HOLD_MS = 220
const MINUTE_MS = 60_000

/** Minutes from midnight of a timestamp. */
function timeOfDay(ms: number): number {
  const d = new Date(ms)
  return d.getHours() * 60 + d.getMinutes()
}

function sameDay(a: number, b: number): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

/**
 * Pull a timestamp onto the nearest snap line of its own day.
 *
 * Snapping the movement rather than the result was the earlier mistake: a job
 * already sitting at 12:07 stayed seven minutes off every line no matter how it
 * was dragged. Snapping the result means a block dropped near noon is at noon.
 */
function snapToGrid(ms: number, snapMinutes: number): number {
  const date = new Date(ms)
  const minutes = date.getHours() * 60 + date.getMinutes()
  const snapped = Math.round(minutes / snapMinutes) * snapMinutes
  date.setSeconds(0, 0)
  return date.getTime() + (snapped - minutes) * MINUTE_MS
}

/**
 * Moving and resizing jobs on the week timeline.
 *
 * Positions are carried as absolute timestamps rather than minutes-into-the-day
 * so that a drag across day columns, across midnight, or over a daylight-saving
 * change is one piece of arithmetic instead of three special cases. The hook
 * only ever produces a preview; committing it is the caller's business.
 */
export function useWeekDrag({
  window: timeWindow,
  pxPerMinute,
  snapMinutes,
  laneIdOf,
  onCommit,
}: {
  window: TimeWindow
  pxPerMinute: number
  snapMinutes: number
  /** Lane a job currently belongs to, under the active grouping. */
  laneIdOf: (job: WorkBoardJob) => string
  onCommit: (change: { job: WorkBoardJob; laneId: string; start: Date; end: Date }) => void
}) {
  const columns = useRef<Map<string, HTMLElement>>(new Map())
  const [preview, setPreview] = useState<WeekDragPreview | null>(null)
  const [armed, setArmed] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const activeRef = useRef<ActiveDrag | null>(null)
  const pendingRef = useRef<ActiveDrag | null>(null)
  const jobRef = useRef<WorkBoardJob | null>(null)
  const previewRef = useRef<WeekDragPreview | null>(null)

  const registerColumn = useCallback((key: string, el: HTMLElement | null) => {
    if (el) columns.current.set(key, el)
    else columns.current.delete(key)
  }, [])

  /** The column under a point, if any. */
  const columnAt = useCallback((clientX: number, clientY: number) => {
    for (const [key, el] of columns.current) {
      const rect = el.getBoundingClientRect()
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return { key, rect, ...parseColumnKey(key) }
      }
    }
    return null
  }, [])

  /**
   * Where a pointer sits on the board, for drops that come from outside the
   * timeline such as the unassigned panel.
   */
  const resolvePoint = useCallback(
    (clientX: number, clientY: number): WeekDropTarget | null => {
      const hit = columnAt(clientX, clientY)
      if (!hit) return null
      const raw = minutesAtPoint(clientY, hit.rect, timeWindow, pxPerMinute)
      const snapped = Math.round(raw / snapMinutes) * snapMinutes
      return {
        date: hit.date,
        laneId: hit.laneId,
        startMins: Math.max(
          timeWindow.startMins,
          Math.min(snapped, timeWindow.endMins - snapMinutes)
        ),
      }
    },
    [columnAt, timeWindow, pxPerMinute, snapMinutes]
  )

  const clearDrag = useCallback(() => {
    if (pendingRef.current?.holdTimer) clearTimeout(pendingRef.current.holdTimer)
    pendingRef.current = null
    activeRef.current = null
    jobRef.current = null
    previewRef.current = null
    setPreview(null)
    setArmed(false)
    setIsDragging(false)
  }, [])

  const applyMove = useCallback(
    (clientX: number, clientY: number) => {
      const drag = activeRef.current
      const job = jobRef.current
      if (!drag || !job) return

      const deltaMins = (clientY - drag.anchorY) / pxPerMinute
      const duration = drag.origEndMs - drag.origStartMs
      const windowMs = (timeWindow.endMins - timeWindow.startMins) * MINUTE_MS

      let laneId = drag.origLaneId
      let startMs = drag.origStartMs
      let endMs = drag.origEndMs

      if (drag.mode === 'move') {
        let dayShiftMs = 0
        const hit = columnAt(clientX, clientY)
        if (hit) {
          laneId = hit.laneId
          const origDay = new Date(drag.origStartMs)
          origDay.setHours(0, 0, 0, 0)
          dayShiftMs = dayStartDate(hit.date).getTime() - origDay.getTime()
        }

        startMs = snapToGrid(drag.origStartMs + dayShiftMs + deltaMins * MINUTE_MS, snapMinutes)
        endMs = startMs + duration

        // A job that fits inside the visible hours stays inside them, so a
        // block cannot be parked half off the top of the board. Jobs longer
        // than the visible day are left alone: there is no position that
        // satisfies the constraint.
        if (duration <= windowMs) {
          const minutes = timeOfDay(startMs)
          const latestStart = timeWindow.endMins - duration / MINUTE_MS
          const clamped = Math.max(timeWindow.startMins, Math.min(minutes, latestStart))
          if (clamped !== minutes) {
            startMs += (clamped - minutes) * MINUTE_MS
            endMs = startMs + duration
          }
        }
      } else if (drag.mode === 'resize-start') {
        startMs = Math.min(
          snapToGrid(drag.origStartMs + deltaMins * MINUTE_MS, snapMinutes),
          drag.origEndMs - snapMinutes * MINUTE_MS
        )
        // Only pull the edge back into view while it is still on its own day;
        // a multi-day job legitimately starts before the visible hours.
        if (sameDay(startMs, drag.origStartMs)) {
          const minutes = timeOfDay(startMs)
          if (minutes < timeWindow.startMins) {
            startMs += (timeWindow.startMins - minutes) * MINUTE_MS
          }
        }
      } else {
        endMs = Math.max(
          snapToGrid(drag.origEndMs + deltaMins * MINUTE_MS, snapMinutes),
          drag.origStartMs + snapMinutes * MINUTE_MS
        )
        if (sameDay(endMs, drag.origEndMs)) {
          const minutes = timeOfDay(endMs)
          if (minutes > timeWindow.endMins) {
            endMs -= (minutes - timeWindow.endMins) * MINUTE_MS
          }
        }
      }

      const next: WeekDragPreview = { jobId: job.id, startMs, endMs, laneId }
      previewRef.current = next
      setPreview(next)
    },
    [columnAt, pxPerMinute, snapMinutes, timeWindow]
  )

  const startDrag = useCallback(
    (event: React.PointerEvent, job: WorkBoardJob, mode: WeekDragMode) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if (!job.startDateTime || !job.endDateTime) return

      const base: ActiveDrag = {
        jobId: job.id,
        mode,
        origStartMs: new Date(job.startDateTime).getTime(),
        origEndMs: new Date(job.endDateTime).getTime(),
        origLaneId: laneIdOf(job),
        anchorX: event.clientX,
        anchorY: event.clientY,
      }
      jobRef.current = job

      if (event.pointerType === 'touch') {
        // A finger has to rest before it moves anything, otherwise every
        // attempt to scroll the board would drag a job instead.
        base.holdTimer = window.setTimeout(() => {
          const pending = pendingRef.current
          if (!pending) return
          pending.holdTimer = undefined
          activeRef.current = pending
          pendingRef.current = null
          setIsDragging(true)
        }, TOUCH_HOLD_MS)
      }

      pendingRef.current = base
      setArmed(true)
    },
    [laneIdOf]
  )

  useEffect(() => {
    if (!armed) return

    const onMove = (event: PointerEvent) => {
      const pending = pendingRef.current
      if (pending) {
        const distance =
          Math.abs(event.clientX - pending.anchorX) + Math.abs(event.clientY - pending.anchorY)
        if (pending.holdTimer !== undefined) {
          // Still waiting out the touch hold: real movement means a scroll.
          if (distance > DRAG_THRESHOLD * 2) clearDrag()
          return
        }
        if (distance < DRAG_THRESHOLD) return
        activeRef.current = pending
        pendingRef.current = null
        setIsDragging(true)
      }
      if (!activeRef.current) return
      if (event.cancelable) event.preventDefault()
      applyMove(event.clientX, event.clientY)
    }

    const onUp = () => {
      const drag = activeRef.current
      const job = jobRef.current
      const result = previewRef.current
      clearDrag()
      if (!drag || !job || !result) return
      if (
        result.startMs === drag.origStartMs &&
        result.endMs === drag.origEndMs &&
        result.laneId === drag.origLaneId
      ) {
        return
      }
      onCommit({
        job,
        laneId: result.laneId,
        start: new Date(result.startMs),
        end: new Date(result.endMs),
      })
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', clearDrag)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', clearDrag)
    }
  }, [applyMove, armed, clearDrag, onCommit])

  return {
    preview,
    isDragging,
    startDrag,
    cancelDrag: clearDrag,
    registerColumn,
    resolvePoint,
  }
}
