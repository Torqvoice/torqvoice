'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Wrench, ClipboardCheck, Wifi, WifiOff } from 'lucide-react'
import { useWorkBoardStore, type Technician } from '../store/workboardStore'
import { useWorkBoardWebSocket } from '../hooks/useWorkBoardWebSocket'
import type { WorkBoardJob } from '../Actions/boardActions'
import { getBoardJobs } from '../Actions/boardActions'
import { getTechnicians } from '../Actions/technicianActions'
import { PresenterDayView } from './PresenterDayView'
import { PresenterKanbanView } from './PresenterKanbanView'
import { PresenterTimeline } from './PresenterTimeline'
import { jobOverlapsDate } from '../utils/datetime'
import { useTranslations, useLocale } from 'next-intl'

type ViewMode = 'week' | 'day' | 'status' | 'timeline'

function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(date: Date): string {
  const d = new Date(date); const day = d.getDay(); d.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  return toLocalDateString(d)
}

function getWeekDays(weekStart: string): string[] {
  const days: string[] = []
  for (let i = 0; i < 7; i++) { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + i); days.push(toLocalDateString(d)); }
  return days
}

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

function formatWeekRange(weekStart: string, locale?: string): string {
  const start = new Date(weekStart + 'T12:00:00'); const end = new Date(start); end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString(locale, opts)} – ${end.toLocaleDateString(locale, { ...opts, year: 'numeric' })}`
}

function formatDayDate(dateStr: string, locale?: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric' })
}

function LiveClock() {
  const [time, setTime] = useState<string | null>(null)
  useEffect(() => { function update() { setTime(new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })) } update(); const timer = setInterval(update, 1000); return () => clearInterval(timer) }, [])
  if (!time) return <span className="tabular-nums">&nbsp;</span>
  return <span className="tabular-nums">{time}</span>
}

function PresenterJobCard({ job }: { job: WorkBoardJob }) {
  const isServiceRecord = job.type === 'serviceRecord'
  return (
    <div className="rounded-md border bg-card p-2 text-sm shadow-sm">
      <div className="flex items-center gap-1.5">
        {isServiceRecord ? <Wrench className="h-4 w-4 shrink-0 text-blue-500" /> : <ClipboardCheck className="h-4 w-4 shrink-0 text-green-500" />}
        <span className="truncate font-semibold">{job.title}</span>
      </div>
      {job.vehicle && <p className="mt-0.5 truncate text-muted-foreground">{job.vehicle.year} {job.vehicle.make} {job.vehicle.model}{job.vehicle.licensePlate ? ` · ${job.vehicle.licensePlate}` : ''}</p>}
      {job.status && <span className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 text-xs capitalize">{job.status.replace(/_/g, ' ')}</span>}
    </div>
  )
}

export function WorkBoardPresenter({ initialTechnicians, initialAssignments, initialWeekStart, workDayStart = '07:00', workDayEnd = '15:00' }: {
  initialTechnicians: Technician[]; initialAssignments: WorkBoardJob[]; initialWeekStart: string; workDayStart?: string; workDayEnd?: string
}) {
  const store = useWorkBoardStore()
  const t = useTranslations('workBoard.presenter')
  const tb = useTranslations('workBoard.board')
  const locale = useLocale()
  const searchParams = useSearchParams(); const router = useRouter(); const pathname = usePathname()
  const VALID_VIEWS: ViewMode[] = ['week', 'day', 'status', 'timeline']
  const urlView = searchParams.get('view') as ViewMode | null
  const urlDate = searchParams.get('date')
  const [viewMode, setViewMode] = useState<ViewMode>(urlView && VALID_VIEWS.includes(urlView) ? urlView : 'week')
  const [selectedDate, setSelectedDateState] = useState(urlDate || toLocalDateString(new Date()))
  const updateUrl = useCallback((v: ViewMode, d: string) => { const p = new URLSearchParams(); p.set('view', v); p.set('date', d); router.replace(`${pathname}?${p.toString()}`, { scroll: false }) }, [router, pathname])
  const setSelectedDate = useCallback((d: string) => { setSelectedDateState(d); updateUrl(viewMode, d) }, [viewMode, updateUrl])
  const handleSetViewMode = (m: ViewMode) => { setViewMode(m); updateUrl(m, selectedDate) }

  useEffect(() => { store.setTechnicians(initialTechnicians); store.setJobs(initialAssignments); store.setWeekStart(initialWeekStart); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  useWorkBoardWebSocket()

  const weekStart = store.weekStart || initialWeekStart
  const days = getWeekDays(weekStart)
  const today = toLocalDateString(new Date())

  const loadWeekData = useCallback(async (ws: string) => {
    store.setWeekStart(ws)
    const [assignRes, techRes] = await Promise.all([getBoardJobs(ws), getTechnicians()])
    if (assignRes.success && assignRes.data) store.setJobs(assignRes.data as WorkBoardJob[])
    if (techRes.success && techRes.data) store.setTechnicians(techRes.data as Technician[])
  }, [store])

  const ensureWeekLoaded = useCallback((dateStr: string) => { const m = getMonday(new Date(dateStr + 'T12:00:00')); if (m !== weekStart) loadWeekData(m) }, [weekStart, loadWeekData])
  const handlePrev = () => { if (viewMode === 'week') { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() - 7); loadWeekData(toLocalDateString(d)) } else { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() - 1); const nd = toLocalDateString(d); setSelectedDate(nd); ensureWeekLoaded(nd) } }
  const handleNext = () => { if (viewMode === 'week') { const d = new Date(weekStart + 'T12:00:00'); d.setDate(d.getDate() + 7); loadWeekData(toLocalDateString(d)) } else { const d = new Date(selectedDate + 'T12:00:00'); d.setDate(d.getDate() + 1); const nd = toLocalDateString(d); setSelectedDate(nd); ensureWeekLoaded(nd) } }
  const handleToday = () => { setSelectedDate(toLocalDateString(new Date())); loadWeekData(getMonday(new Date())) }

  useEffect(() => {
    function msUntilMidnight() { const now = new Date(); const m = new Date(now); m.setHours(24, 0, 0, 0); return m.getTime() - now.getTime() }
    let timeout: ReturnType<typeof setTimeout>
    function schedule() { timeout = setTimeout(() => { const now = new Date(); setSelectedDate(toLocalDateString(now)); loadWeekData(getMonday(now)); schedule() }, msUntilMidnight() + 500) }
    schedule(); return () => clearTimeout(timeout)
  }, [loadWeekData, setSelectedDate])

  const dateLabel = viewMode === 'week' ? formatWeekRange(weekStart, locale) : formatDayDate(selectedDate, locale)

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold">{t('title')}</h1>
          <span className="text-sm text-muted-foreground">{dateLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border">
            <Button variant={viewMode === 'timeline' ? 'default' : 'ghost'} size="sm" className="rounded-none rounded-l-md" onClick={() => handleSetViewMode('timeline')}>{t('timeline')}</Button>
            <Button variant={viewMode === 'day' ? 'default' : 'ghost'} size="sm" className="rounded-none border-l" onClick={() => handleSetViewMode('day')}>{t('day')}</Button>
            <Button variant={viewMode === 'status' ? 'default' : 'ghost'} size="sm" className="rounded-none border-x" onClick={() => handleSetViewMode('status')}>{t('status')}</Button>
            <Button variant={viewMode === 'week' ? 'default' : 'ghost'} size="sm" className="rounded-none rounded-r-md" onClick={() => handleSetViewMode('week')}>{t('week')}</Button>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrev}><ChevronLeft className="h-5 w-5" /></Button>
            <Button variant="outline" size="sm" onClick={handleToday}>{t('today')}</Button>
            <Button variant="ghost" size="icon" onClick={handleNext}><ChevronRight className="h-5 w-5" /></Button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {store.isConnected ? <span className="flex items-center gap-1.5 text-green-600" title={t('live')}><Wifi className="h-4 w-4" /><span className="text-xs">{t('live')}</span></span> : <span className="flex items-center gap-1.5 animate-pulse text-red-500" title={t('disconnected')}><WifiOff className="h-4 w-4" /><span className="text-xs">{t('disconnected')}</span></span>}
            <LiveClock />
          </div>
        </div>
      </header>

      {viewMode === 'timeline' ? (
        <PresenterTimeline date={selectedDate} technicians={store.technicians} assignments={store.jobs} workDayStart={workDayStart} workDayEnd={workDayEnd} />
      ) : viewMode === 'day' ? (
        <PresenterDayView date={selectedDate} technicians={store.technicians} assignments={store.jobs} />
      ) : viewMode === 'status' ? (
        <PresenterKanbanView date={selectedDate} technicians={store.technicians} assignments={store.jobs} />
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid h-full min-w-225" style={{ gridTemplateColumns: '160px repeat(7, 1fr)', gridTemplateRows: `auto ${store.technicians.length > 0 ? `repeat(${store.technicians.length}, 1fr)` : '1fr'}` }}>
            <div className="border-b p-2" />
            {days.map((day, i) => {
              const isToday = day === today; const d = new Date(day + 'T12:00:00');
              return <div key={day} className={`border-b border-l p-2 text-center text-sm font-semibold ${isToday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>{tb(`days.${DAY_KEYS[i]}`)} {d.getDate()}/{d.getMonth() + 1}</div>
            })}
            {store.technicians.map((tech) => {
              const techJobs = store.jobs.filter((a) => a.technicianId === tech.id)
              return (
                <div key={tech.id} className="contents">
                  <div className="flex items-center gap-2 border-b p-2">
                    <div className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: tech.color }} />
                    <span className="truncate text-sm font-semibold">{tech.name}</span>
                  </div>
                  {days.map((day) => {
                    const cellJobs = techJobs.filter((a) => jobOverlapsDate(a, day)).sort((a, b) => a.sortOrder - b.sortOrder)
                    const isToday = day === today
                    return (
                      <div key={`${tech.id}-${day}`} className={`space-y-1 overflow-y-auto border-b border-l p-1.5 ${isToday ? 'bg-primary/5' : ''}`}>
                        {cellJobs.map((a) => <PresenterJobCard key={a.id} job={a} />)}
                      </div>
                    )
                  })}
                </div>
              )
            })}
            {store.technicians.length === 0 && <div className="col-span-8 flex items-center justify-center p-10"><p className="text-lg text-muted-foreground">{t('noTechnicians')}</p></div>}
          </div>
        </div>
      )}
    </div>
  )
}
