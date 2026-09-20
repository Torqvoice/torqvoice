'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { useRealtime } from '@/features/realtime/RealtimeProvider'
import { getMyClock, startMyClock, stopMyClock, type MyClock } from '../Actions/timeClockActions'
import type { JobLaborEvent, JobStatusChangedEvent } from '@/features/vehicles/Lib/jobEvents'
import type { ClockEvent } from '../Lib/timeEntries'
import { formatMinutes } from '../Lib/timesheet'

/**
 * The signed-in person's clock, held once for the whole app.
 *
 * The header pill, the work order panel and the timesheet all read the same
 * state, and one socket keeps it honest: a clock started from the phone
 * shows up in the browser without a reload, and the other way round.
 */

/**
 * What arrives on the work board channel and is handed to subscribers here.
 * The socket carries more than this (cards moving on the board, technicians
 * coming and going); those go to the board's own hook, and anything this
 * provider does not name is passed along untouched for a listener to ignore.
 */
export type WorkshopEvent = ClockEvent | JobLaborEvent | JobStatusChangedEvent

type Listener = (event: WorkshopEvent) => void

interface TimeClockValue {
  /** Whether the signed-in account is linked to a technician row here. */
  isTechnician: boolean
  technicianIds: string[]
  open: MyClock['open']
  /** True while a start or stop is in flight. */
  busy: boolean
  start: (serviceRecordId: string) => Promise<boolean>
  stop: () => Promise<boolean>
  refresh: () => Promise<void>
  /** Every work board event in the workshop: a clock change, a line of work. */
  subscribe: (listener: Listener) => () => void
}

const TimeClockContext = createContext<TimeClockValue | null>(null)

export function TimeClockProvider({
  technicianIds,
  children,
}: {
  technicianIds: string[]
  children: ReactNode
}) {
  const t = useTranslations('timeTracking.clock')
  const [open, setOpen] = useState<MyClock['open']>(null)
  const [busy, setBusy] = useState(false)
  const listeners = useRef(new Set<Listener>())
  const idsRef = useRef(technicianIds)
  idsRef.current = technicianIds
  const isTechnician = technicianIds.length > 0

  const refresh = useCallback(async () => {
    if (idsRef.current.length === 0) return
    const result = await getMyClock()
    if (result.success && result.data) setOpen(result.data.open)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The work board channel, off the app's one socket (features/realtime).
  // This used to be a WebSocket of its own, with its own authentication and
  // its own reconnect loop, which is what the app had five of.
  const realtime = useRealtime()
  useEffect(() => {
    if (!realtime) return
    const stop = realtime.onLegacy('workboard', (data) => {
      const event = data as Partial<WorkshopEvent>
      if (typeof event?.type !== 'string') return
      const workshopEvent = event as WorkshopEvent
      if (
        (workshopEvent.type === 'clock_started' || workshopEvent.type === 'clock_stopped') &&
        idsRef.current.includes(workshopEvent.technicianId)
      ) {
        void refresh()
      }
      for (const listener of listeners.current) listener(workshopEvent)
    })
    return stop
  }, [realtime, refresh])

  // A reconnection means events were missed, so the clock is read again.
  useEffect(() => {
    if (!realtime) return
    return realtime.onResync(() => void refresh())
  }, [realtime, refresh])

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])

  const start = useCallback(
    async (serviceRecordId: string) => {
      if (busy) return false
      setBusy(true)
      try {
        const result = await startMyClock({ serviceRecordId })
        if (!result.success || !result.data) {
          toast.error(result.error || t('startFailed'))
          return false
        }
        if (result.data.closed) {
          toast(t('switched', { minutes: formatMinutes(result.data.closed.minutes ?? 0) }))
        }
        await refresh()
        return true
      } finally {
        setBusy(false)
      }
    },
    [busy, refresh, t]
  )

  const stop = useCallback(async () => {
    if (busy) return false
    setBusy(true)
    try {
      const result = await stopMyClock()
      if (!result.success || !result.data) {
        toast.error(result.error || t('stopFailed'))
        await refresh()
        return false
      }
      toast.success(t('stopped', { minutes: formatMinutes(result.data.minutes) }))
      setOpen(null)
      return true
    } finally {
      setBusy(false)
    }
  }, [busy, refresh, t])

  const value = useMemo<TimeClockValue>(
    () => ({ isTechnician, technicianIds, open, busy, start, stop, refresh, subscribe }),
    [isTechnician, technicianIds, open, busy, start, stop, refresh, subscribe]
  )

  return <TimeClockContext.Provider value={value}>{children}</TimeClockContext.Provider>
}

export function useTimeClock(): TimeClockValue {
  const ctx = useContext(TimeClockContext)
  if (!ctx) {
    throw new Error('useTimeClock must be used inside TimeClockProvider')
  }
  return ctx
}

/**
 * Re-run `handler` on every work board event in the workshop.
 *
 * Quiet rather than fatal without the provider: this is how a page stays
 * current, never how it works. A work order rendered outside the app shell
 * (a preview, a test) should still render, and simply not update by itself.
 */
export function useWorkshopEvents(handler: Listener) {
  const subscribe = useContext(TimeClockContext)?.subscribe
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribe?.((event) => ref.current(event)), [subscribe])
}

/** Re-run `handler` on every clock change in the workshop. */
export function useClockEvents(handler: (event: ClockEvent) => void) {
  useWorkshopEvents((event) => {
    if (event.type === 'clock_started' || event.type === 'clock_stopped') handler(event)
  })
}
