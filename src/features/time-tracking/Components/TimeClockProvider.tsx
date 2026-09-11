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
import { getMyClock, startMyClock, stopMyClock, type MyClock } from '../Actions/timeClockActions'
import type { ClockEvent } from '../Lib/timeEntries'
import { formatMinutes } from '../Lib/timesheet'

/**
 * The signed-in person's clock, held once for the whole app.
 *
 * The header pill, the work order panel and the timesheet all read the same
 * state, and one socket keeps it honest: a clock started from the phone
 * shows up in the browser without a reload, and the other way round.
 */

type Listener = (event: ClockEvent) => void

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
  /** Every clock change in the workshop, anyone's. */
  subscribe: (listener: Listener) => () => void
}

const TimeClockContext = createContext<TimeClockValue | null>(null)

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000]

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

  // One socket for the life of the app shell. Mirrors the work board hook:
  // liveness is a per-run closure so a StrictMode remount cannot leave two
  // sockets each reconnecting on the other's behalf.
  useEffect(() => {
    let alive = true
    let attempt = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let ws: WebSocket | null = null

    const connect = () => {
      if (!alive) return
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      ws = new WebSocket(`${protocol}//${window.location.host}/api/protected/ws`)
      ws.onopen = () => {
        attempt = 0
        // Anything that changed while the socket was down.
        void refresh()
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          if (msg.type !== 'workboard') return
          const data = msg.data as Partial<ClockEvent>
          if (data.type !== 'clock_started' && data.type !== 'clock_stopped') return
          const clockEvent = data as ClockEvent
          if (idsRef.current.includes(clockEvent.technicianId)) void refresh()
          for (const listener of listeners.current) listener(clockEvent)
        } catch {
          /* a frame we do not understand is not worth a broken clock */
        }
      }
      ws.onclose = () => {
        if (!alive) return
        const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
        attempt++
        timer = setTimeout(connect, delay)
      }
      ws.onerror = () => ws?.close()
    }

    connect()
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
      ws?.close()
    }
  }, [refresh])

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

/** Re-run `handler` on every clock change in the workshop. */
export function useClockEvents(handler: Listener) {
  const { subscribe } = useTimeClock()
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => subscribe((event) => ref.current(event)), [subscribe])
}
