'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Wrench, ClipboardCheck, Wifi, WifiOff } from 'lucide-react'
import { useWorkBoardStore, type Technician } from '../store/workboardStore'
import { useWorkBoardWebSocket } from '../hooks/useWorkBoardWebSocket'
import type { BoardAssignmentWithJob } from '../Actions/boardActions'
import { getBoardAssignments } from '../Actions/boardActions'
import { getTechnicians } from '../Actions/technicianActions'
import { PresenterDayView } from './PresenterDayView'

type ViewMode = 'week' | 'day'

function toLocalDateString(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getMonday(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return toLocalDateString(d)
}

function getWeekDays(weekStart: string): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + 'T12:00:00')
    d.setDate(d.getDate() + i)
    days.push(toLocalDateString(d))
  }
  return days
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatDayHeader(dateStr: string, index: number) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_LABELS[index]} ${d.getDate()}/${d.getMonth() + 1}`
}

function formatWeekRange(weekStart: string): string {
  const start = new Date(weekStart + 'T12:00:00')
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`
}

function formatDayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

function LiveClock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => {
    function update() {
      setTime(
        new Date().toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      )
    }
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [])
  if (!time) return <span className="tabular-nums">&nbsp;</span>
  return <span className="tabular-nums">{time}</span>
}

function PresenterJobCard({ assignment }: { assignment: BoardAssignmentWithJob }) {
  const isServiceRecord = !!assignment.serviceRecordId
  const vehicle = isServiceRecord
    ? assignment.serviceRecord?.vehicle
    : assignment.inspection?.vehicle
  const title = isServiceRecord
    ? assignment.serviceRecord?.title
    : assignment.inspection?.template?.name
  const status = isServiceRecord ? assignment.serviceRecord?.status : assignment.inspection?.status

  return (
    <div className="rounded-md border bg-card p-2 text-sm shadow-sm">
      <div className="flex items-center gap-1.5">
        {isServiceRecord ? (
          <Wrench className="h-4 w-4 shrink-0 text-blue-500" />
        ) : (
          <ClipboardCheck className="h-4 w-4 shrink-0 text-green-500" />
        )}
        <span className="truncate font-semibold">{title}</span>
      </div>
      {vehicle && (
        <p className="mt-0.5 truncate text-muted-foreground">
          {vehicle.year} {vehicle.make} {vehicle.model}
          {vehicle.licensePlate ? ` · ${vehicle.licensePlate}` : ''}
        </p>
      )}
      {status && (
        <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs capitalize">
          {status.replace(/_/g, ' ')}
        </span>
      )}
    </div>
  )
}

export function WorkBoardPresenter({
  initialTechnicians,
  initialAssignments,
  initialWeekStart,
}: {
  initialTechnicians: Technician[]
  initialAssignments: BoardAssignmentWithJob[]
  initialWeekStart: string
}) {
  const store = useWorkBoardStore()
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('presenter-view-mode')
      if (saved === 'day' || saved === 'week') return saved
    }
    return 'week'
  })
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(new Date()))

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    localStorage.setItem('presenter-view-mode', mode)
  }

  // Initialize store from server data
  useEffect(() => {
    store.setTechnicians(initialTechnicians)
    store.setAssignments(initialAssignments)
    store.setWeekStart(initialWeekStart)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useWorkBoardWebSocket()

  const weekStart = store.weekStart || initialWeekStart
  const days = getWeekDays(weekStart)
  const today = toLocalDateString(new Date())

  const loadWeekData = useCallback(
    async (ws: string) => {
      store.setWeekStart(ws)
      const [assignRes, techRes] = await Promise.all([getBoardAssignments(ws), getTechnicians()])
      if (assignRes.success && assignRes.data) {
        store.setAssignments(assignRes.data as BoardAssignmentWithJob[])
      }
      if (techRes.success && techRes.data) {
        store.setTechnicians(techRes.data as Technician[])
      }
    },
    [store]
  )

  // Ensure the selected day's week data is loaded
  const ensureWeekLoaded = useCallback(
    (dateStr: string) => {
      const monday = getMonday(new Date(dateStr + 'T12:00:00'))
      if (monday !== weekStart) {
        loadWeekData(monday)
      }
    },
    [weekStart, loadWeekData]
  )

  const handlePrev = () => {
    if (viewMode === 'week') {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() - 7)
      loadWeekData(toLocalDateString(d))
    } else {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() - 1)
      const newDate = toLocalDateString(d)
      setSelectedDate(newDate)
      ensureWeekLoaded(newDate)
    }
  }

  const handleNext = () => {
    if (viewMode === 'week') {
      const d = new Date(weekStart + 'T12:00:00')
      d.setDate(d.getDate() + 7)
      loadWeekData(toLocalDateString(d))
    } else {
      const d = new Date(selectedDate + 'T12:00:00')
      d.setDate(d.getDate() + 1)
      const newDate = toLocalDateString(d)
      setSelectedDate(newDate)
      ensureWeekLoaded(newDate)
    }
  }

  const handleToday = () => {
    const todayStr = toLocalDateString(new Date())
    setSelectedDate(todayStr)
    loadWeekData(getMonday(new Date()))
  }

  // Auto-advance at midnight
  useEffect(() => {
    function msUntilMidnight() {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      return midnight.getTime() - now.getTime()
    }

    let timeout: ReturnType<typeof setTimeout>

    function scheduleAdvance() {
      timeout = setTimeout(() => {
        const now = new Date()
        const newMonday = getMonday(now)
        setSelectedDate(toLocalDateString(now))
        loadWeekData(newMonday)
        scheduleAdvance()
      }, msUntilMidnight() + 500)
    }

    scheduleAdvance()
    return () => clearTimeout(timeout)
  }, [loadWeekData])

  const dateLabel =
    viewMode === 'week' ? formatWeekRange(weekStart) : formatDayDate(selectedDate)

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header bar */}
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">Work Board</h1>
          <span className="text-sm text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex rounded-md border">
            <Button
              variant={viewMode === 'day' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-r-none"
              onClick={() => handleSetViewMode('day')}
            >
              Day
            </Button>
            <Button
              variant={viewMode === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="rounded-l-none"
              onClick={() => handleSetViewMode('week')}
            >
              Week
            </Button>
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrev}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday}>
              Today
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext}>
              <ChevronRight className="h-5 w-5" />
            </Button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {store.isConnected ? (
              <span
                className="flex items-center gap-1.5 text-green-600"
                title="Board is receiving live updates"
              >
                <Wifi className="h-4 w-4" />
                <span className="text-xs">Live</span>
              </span>
            ) : (
              <span
                className="flex items-center gap-1.5 animate-pulse text-red-500"
                title="Check WebSocket connection — ensure you are logged in as an admin or owner"
              >
                <WifiOff className="h-4 w-4" />
                <span className="text-xs">Live updates disconnected</span>
              </span>
            )}
            <LiveClock />
          </div>
        </div>
      </header>

      {/* Content */}
      {viewMode === 'day' ? (
        <PresenterDayView
          date={selectedDate}
          technicians={store.technicians}
          assignments={store.assignments}
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <div
            className="grid h-full min-w-225"
            style={{
              gridTemplateColumns: '160px repeat(7, 1fr)',
              gridTemplateRows: `auto ${store.technicians.length > 0 ? `repeat(${store.technicians.length}, 1fr)` : '1fr'}`,
            }}
          >
            {/* Day header row */}
            <div className="border-b p-2" />
            {days.map((day, i) => {
              const isToday = day === today
              return (
                <div
                  key={day}
                  className={`border-b border-l p-2 text-center text-sm font-semibold ${
                    isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {formatDayHeader(day, i)}
                </div>
              )
            })}

            {/* Technician rows */}
            {store.technicians.map((tech) => {
              const techAssignments = store.assignments.filter((a) => a.technicianId === tech.id)
              return (
                <div key={tech.id} className="contents">
                  <div className="flex items-center gap-2 border-b p-2">
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: tech.color }}
                    />
                    <span className="truncate text-sm font-semibold">{tech.name}</span>
                  </div>
                  {days.map((day) => {
                    const cellAssignments = techAssignments
                      .filter((a) => a.date === day)
                      .sort((a, b) => a.sortOrder - b.sortOrder)
                    const isToday = day === today
                    return (
                      <div
                        key={`${tech.id}-${day}`}
                        className={`space-y-1 overflow-y-auto border-b border-l p-1.5 ${
                          isToday ? 'bg-primary/5' : ''
                        }`}
                      >
                        {cellAssignments.map((assignment) => (
                          <PresenterJobCard key={assignment.id} assignment={assignment} />
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}

            {store.technicians.length === 0 && (
              <div className="col-span-8 flex items-center justify-center p-10">
                <p className="text-lg text-muted-foreground">No technicians configured</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
