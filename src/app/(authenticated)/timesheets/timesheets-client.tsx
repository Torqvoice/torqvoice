'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import { toast } from 'sonner'
import type { DateRange } from 'react-day-picker'
import {
  CalendarIcon,
  Clock,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Square,
  Timer,
  Trash2,
  Users,
  Activity,
  Gauge,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { AppCard } from '@/components/app-card'
import { useConfirm } from '@/components/confirm-dialog'
import { useDateSettings } from '@/components/date-settings-context'
import { useFormatDate } from '@/lib/use-format-date'
import { addZonedDays, startOfZonedDay, zonedDayKey } from '@/lib/timezone'
import { cn } from '@/lib/utils'
import {
  deleteTimeEntry,
  getTimesheet,
  stopTimeEntry,
  type TimesheetData,
} from '@/features/time-tracking/Actions/timesheetActions'
import {
  buildTimesheet,
  entryMinutes,
  formatElapsed,
  formatMinutes,
  type SheetEntry,
  type TechnicianSheet,
  type Timesheet,
} from '@/features/time-tracking/Lib/timesheet'
import { downloadText, timesheetCsv } from '@/features/time-tracking/Lib/timesheet-csv'
import { useClockEvents } from '@/features/time-tracking/Components/TimeClockProvider'
import { useTick } from '@/features/time-tracking/hooks/useTick'
import { SourceBadge } from '@/features/time-tracking/Components/SourceBadge'
import { TimeEntryDialog } from '@/features/time-tracking/Components/TimeEntryDialog'

/** A day key as a Date that formats to that day in any zone within twelve hours of UTC. */
function noonOf(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`)
}

/** A day key as the browser-local midnight the calendar picker works in. */
function localDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function localKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

type Preset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth'
const PRESETS: Preset[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth']

/**
 * Preset windows on the workshop's calendar, honouring its week start.
 *
 * A week or a month is the whole of it, days still to come included, not
 * "so far": on a Monday "this week" would otherwise be one day and read the
 * same as "today", and the grid would grow a column each morning.
 */
function presetRange(
  preset: Preset,
  timeZone: string,
  weekStartDay: number,
  now: Date
): { from: string; to: string } {
  const today = startOfZonedDay(now, timeZone)
  const key = (d: Date) => zonedDayKey(d, timeZone)
  const shift = (d: Date, n: number) => addZonedDays(d, n, timeZone)
  // Day of week in the workshop, 0 = Sunday, read off a noon instant so a
  // DST edge cannot tip it into the wrong day.
  const dow = new Date(today.getTime() + 12 * 3_600_000).getUTCDay()
  const sinceWeekStart = (dow - weekStartDay + 7) % 7
  const weekStart = shift(today, -sinceWeekStart)
  const monthKey = key(today).slice(0, 7)
  switch (preset) {
    case 'today':
      return { from: key(today), to: key(today) }
    case 'yesterday': {
      const y = shift(today, -1)
      return { from: key(y), to: key(y) }
    }
    case 'thisWeek':
      return { from: key(weekStart), to: key(shift(weekStart, 6)) }
    case 'lastWeek':
      return { from: key(shift(weekStart, -7)), to: key(shift(weekStart, -1)) }
    case 'thisMonth': {
      const [y, m] = monthKey.split('-').map(Number)
      const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
      return { from: `${monthKey}-01`, to: `${monthKey}-${String(lastDay).padStart(2, '0')}` }
    }
    case 'lastMonth': {
      const [y, m] = monthKey.split('-').map(Number)
      const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
      const lastDay = new Date(Date.UTC(y, m - 1, 0)).getUTCDate()
      return { from: `${prev}-01`, to: `${prev}-${String(lastDay).padStart(2, '0')}` }
    }
  }
}

export default function TimesheetsClient({
  initial,
  initialError,
}: {
  initial: TimesheetData | null
  initialError: string | null
}) {
  const t = useTranslations('timeTracking.page')
  const router = useRouter()
  const pathname = usePathname()
  const format = useFormatter()
  const { formatTime, formatDate } = useFormatDate()
  const { weekStartDay } = useDateSettings()
  const confirm = useConfirm()

  const [data, setData] = useState<TimesheetData | null>(initial)
  const [error, setError] = useState<string | null>(initialError)
  const [loading, setLoading] = useState(false)
  const [technicianId, setTechnicianId] = useState<string>('all')
  const [dialog, setDialog] = useState<{
    open: boolean
    entry?: SheetEntry | null
    defaults?: { technicianId?: string; dayKey?: string }
  }>({ open: false })
  const [stoppingId, setStoppingId] = useState<string | null>(null)

  const timeZone = data?.timeZone ?? 'UTC'

  const load = useCallback(
    async (from: string, to: string, tech: string) => {
      setLoading(true)
      const result = await getTimesheet({ from, to, technicianId: tech === 'all' ? null : tech })
      setLoading(false)
      if (!result.success || !result.data) {
        setError(result.error ?? t('loadFailed'))
        return
      }
      setError(null)
      setData(result.data)
      const params = new URLSearchParams({ from, to })
      if (tech !== 'all') params.set('tech', tech)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [pathname, router, t]
  )

  // Any clock change anywhere in the workshop refreshes the sheet, coalesced
  // so a technician switching jobs (one stop, one start) costs one fetch.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useClockEvents(() => {
    if (!data) return
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      void load(data.fromKey, data.toKey, technicianId)
    }, 300)
  })
  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
    }
  }, [])

  const hasRunning = useMemo(() => data?.entries.some((e) => !e.endedAt) ?? false, [data])
  const now = useTick(hasRunning)

  const sheet: Timesheet | null = useMemo(() => {
    if (!data) return null
    const technicians =
      technicianId === 'all'
        ? data.technicians
        : data.technicians.filter((tech) => tech.id === technicianId)
    return buildTimesheet({
      entries: data.entries,
      technicians,
      from: new Date(data.from),
      to: new Date(data.to),
      timeZone: data.timeZone,
      now,
    })
  }, [data, technicianId, now])

  const activePreset = useMemo<Preset | null>(() => {
    if (!data) return null
    for (const preset of PRESETS) {
      const r = presetRange(preset, data.timeZone, weekStartDay, now)
      if (r.from === data.fromKey && r.to === data.toKey) return preset
    }
    return null
  }, [data, weekStartDay, now])

  const dayLabel = useCallback(
    (dayKey: string, style: 'short' | 'long') =>
      format.dateTime(noonOf(dayKey), {
        timeZone,
        weekday: style === 'long' ? 'long' : 'short',
        day: 'numeric',
        month: style === 'long' ? 'long' : 'short',
      }),
    [format, timeZone]
  )

  const todayKey = zonedDayKey(now, timeZone)

  const onSaved = () => {
    if (data) void load(data.fromKey, data.toKey, technicianId)
  }

  const handleStop = async (entry: SheetEntry) => {
    setStoppingId(entry.id)
    const result = await stopTimeEntry(entry.id)
    setStoppingId(null)
    if (!result.success || !result.data) {
      toast.error(result.error ?? t('loadFailed'))
      return
    }
    toast.success(
      t('stoppedByManager', { minutes: formatMinutes(result.data.durationMinutes ?? 0) })
    )
    onSaved()
  }

  const handleDelete = async (entry: SheetEntry) => {
    const ok = await confirm({
      title: t('deleteTitle'),
      description: t('deleteBody', {
        duration: formatMinutes(entryMinutes(entry, now)),
        job: entry.job.title,
        technician: entry.technicianName,
      }),
      confirmLabel: t('deleteConfirm'),
      destructive: true,
    })
    if (!ok) return
    const result = await deleteTimeEntry(entry.id)
    if (!result.success) {
      toast.error(result.error ?? t('loadFailed'))
      return
    }
    toast.success(t('deleted'))
    onSaved()
  }

  const exportCsv = () => {
    if (!data || !sheet) return
    const entries = sheet.technicians.flatMap((s) => s.entries)
    const csv = timesheetCsv(entries, data.timeZone, now, [
      t('csv.technician'),
      t('csv.date'),
      t('csv.start'),
      t('csv.end'),
      t('csv.duration'),
      t('csv.hours'),
      t('csv.job'),
      t('csv.vehicle'),
      t('csv.plate'),
      t('csv.source'),
      t('csv.editedBy'),
      t('csv.note'),
    ])
    downloadText(`timesheet-${data.fromKey}-${data.toKey}.csv`, `﻿${csv}`)
  }

  if (!data || !sheet) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {error ?? t('loadFailed')}
      </div>
    )
  }

  const activeDays = [...sheet.dayTotals.values()].filter((m) => m > 0).length
  const techniciansWithTime = sheet.technicians.filter((s) => s.totalMinutes > 0).length
  const runningEntries = sheet.technicians.flatMap((s) => s.entries.filter((e) => !e.endedAt))

  return (
    <div className="space-y-4">
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/40 p-1">
          {PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={activePreset === preset ? 'default' : 'ghost'}
              className="h-7 px-2.5 text-xs"
              disabled={loading}
              onClick={() => {
                const r = presetRange(preset, timeZone, weekStartDay, new Date())
                void load(r.from, r.to, technicianId)
              }}
            >
              {t(`presets.${preset}`)}
            </Button>
          ))}
          <RangePicker
            fromKey={data.fromKey}
            toKey={data.toKey}
            active={activePreset === null}
            disabled={loading}
            label={
              data.fromKey === data.toKey
                ? formatDate(noonOf(data.fromKey))
                : `${formatDate(noonOf(data.fromKey))} – ${formatDate(noonOf(data.toKey))}`
            }
            onApply={(from, to) => void load(from, to, technicianId)}
          />
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <Select
            value={technicianId}
            onValueChange={(v) => {
              setTechnicianId(v)
              void load(data.fromKey, data.toKey, v)
            }}
          >
            <SelectTrigger className="h-8 w-44" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allTechnicians')}</SelectItem>
              {data.technicians.map((tech) => (
                <SelectItem key={tech.id} value={tech.id}>
                  <span className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ backgroundColor: tech.color }} />
                    {tech.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8"
            onClick={exportCsv}
            disabled={sheet.totalMinutes === 0}
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">{t('export')}</span>
          </Button>
          {data.canEdit && (
            <Button
              type="button"
              size="sm"
              className="h-8"
              onClick={() => setDialog({ open: true, entry: null })}
            >
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">{t('addEntry')}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          icon={Clock}
          label={t('stats.total')}
          value={formatMinutes(sheet.totalMinutes)}
          hint={t('stats.totalHint', { days: sheet.dayKeys.length })}
        />
        <StatTile
          icon={Users}
          label={t('stats.technicians')}
          value={String(techniciansWithTime)}
          hint={t('stats.techniciansHint', { count: data.technicians.length })}
        />
        <StatTile
          icon={Activity}
          label={t('stats.running')}
          value={String(sheet.runningCount)}
          hint={t('stats.runningHint')}
          live={sheet.runningCount > 0}
        />
        <StatTile
          icon={Gauge}
          label={t('stats.average')}
          value={formatMinutes(activeDays ? sheet.totalMinutes / activeDays : 0)}
          hint={t('stats.averageHint', { days: activeDays })}
        />
      </div>

      {/* ── On the clock now ────────────────────────────────────────────── */}
      {runningEntries.length > 0 && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            {t('nowStrip.title')}
          </div>
          <div className="flex flex-wrap gap-2">
            {runningEntries.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-sm shadow-xs"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: e.technicianColor }}
                />
                <span className="font-medium">{e.technicianName}</span>
                <Link
                  href={jobHref(e)}
                  className="max-w-48 truncate text-muted-foreground hover:text-foreground hover:underline"
                >
                  {e.job.title}
                </Link>
                <span className="font-mono text-xs tabular-nums text-primary">
                  {formatElapsed(now.getTime() - new Date(e.startedAt).getTime())}
                </span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {t('nowStrip.since', { time: formatTime(e.startedAt) })}
                </span>
                {data.canEdit && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-xs"
                    disabled={stoppingId === e.id}
                    onClick={() => void handleStop(e)}
                  >
                    {stoppingId === e.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Square className="size-3 fill-current" />
                    )}
                    {t('nowStrip.stop')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Overview grid ───────────────────────────────────────────────── */}
      {sheet.technicians.length > 0 && sheet.totalMinutes > 0 && (
        <AppCard
          icon={Timer}
          title={t('grid.title')}
          description={t('grid.description')}
          contentClassName="p-0"
        >
          {sheet.dayKeys.length > 31 ? (
            <p className="p-4 text-sm text-muted-foreground">{t('grid.tooLong')}</p>
          ) : (
            <DayGrid
              sheet={sheet}
              todayKey={todayKey}
              dayLabel={dayLabel}
              technicianHeader={t('grid.technician')}
              totalHeader={t('grid.total')}
            />
          )}
        </AppCard>
      )}

      {/* ── Entries ─────────────────────────────────────────────────────── */}
      {sheet.totalMinutes === 0 && sheet.runningCount === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Timer className="mx-auto mb-3 size-8 text-muted-foreground/60" />
          <p className="font-medium">{t('empty.title')}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {data.technicians.length === 0 ? t('empty.noTechnicians') : t('empty.body')}
          </p>
          {data.technicians.length === 0 && (
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/settings/team">{t('empty.teamLink')}</Link>
            </Button>
          )}
        </div>
      ) : (
        sheet.technicians
          .filter((s) => s.entries.length > 0)
          .map((s) => (
            <TechnicianCard
              key={s.technician.id}
              sheet={s}
              now={now}
              timeZone={timeZone}
              canEdit={data.canEdit}
              dayLabel={dayLabel}
              formatTime={formatTime}
              stoppingId={stoppingId}
              onEdit={(entry) => setDialog({ open: true, entry })}
              onStop={(entry) => void handleStop(entry)}
              onDelete={(entry) => void handleDelete(entry)}
              onAdd={(dayKey) =>
                setDialog({
                  open: true,
                  entry: null,
                  defaults: { technicianId: s.technician.id, dayKey },
                })
              }
            />
          ))
      )}

      <TimeEntryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        timeZone={timeZone}
        technicians={data.technicians}
        entry={dialog.entry}
        defaults={dialog.defaults}
        onSaved={onSaved}
      />
    </div>
  )
}

function jobHref(e: SheetEntry): string {
  return e.job.vehicleId ? `/vehicles/${e.job.vehicleId}/service/${e.job.id}` : `/sales/${e.job.id}`
}

function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  live,
}: {
  icon: typeof Clock
  label: string
  value: string
  hint: string
  live?: boolean
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-card-edge bg-card p-3 shadow-[0_1px_2px_rgb(0_0_0/0.05)]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5" />
        <span className="truncate">{label}</span>
        {live && (
          <span className="relative ml-auto flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
      </div>
      <div className="mt-1 font-mono text-2xl font-semibold tabular-nums leading-tight">
        {value}
      </div>
      <div className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</div>
    </div>
  )
}

function RangePicker({
  fromKey,
  toKey,
  active,
  disabled,
  label,
  onApply,
}: {
  fromKey: string
  toKey: string
  active: boolean
  disabled: boolean
  label: string
  onApply: (from: string, to: string) => void
}) {
  const t = useTranslations('timeTracking.page')
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<DateRange | undefined>()

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setPending({ from: localDate(fromKey), to: localDate(toKey) })
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={active ? 'default' : 'ghost'}
          className="h-7 px-2.5 text-xs"
          disabled={disabled}
        >
          <CalendarIcon className="size-3.5" />
          {active ? label : t('customRange')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          numberOfMonths={2}
          defaultMonth={localDate(fromKey)}
          selected={pending}
          onSelect={setPending}
        />
        <div className="flex justify-end border-t p-2">
          <Button
            type="button"
            size="sm"
            disabled={!pending?.from}
            onClick={() => {
              if (!pending?.from) return
              const from = localKey(pending.from)
              const to = localKey(pending.to ?? pending.from)
              setOpen(false)
              onApply(from, to)
            }}
          >
            {t('apply')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Technicians down, days across, minutes in the cells shaded by how full a
 * day was against an eight hour reference. The eye finds the empty Tuesday
 * and the fourteen hour Friday before any total does.
 */
function DayGrid({
  sheet,
  todayKey,
  dayLabel,
  technicianHeader,
  totalHeader,
}: {
  sheet: Timesheet
  todayKey: string
  dayLabel: (dayKey: string, style: 'short' | 'long') => string
  technicianHeader: string
  totalHeader: string
}) {
  const shade = (minutes: number) => {
    if (minutes <= 0) return undefined
    const alpha = 0.12 + Math.min(1, minutes / 480) * 0.5
    return {
      backgroundColor: `color-mix(in oklab, var(--primary) ${Math.round(alpha * 100)}%, transparent)`,
    }
  }
  // A day key is already the workshop's day, so its weekday needs no zone.
  const isWeekend = (dayKey: string) => {
    const dow = new Date(`${dayKey}T12:00:00Z`).getUTCDay()
    return dow === 0 || dow === 6
  }
  const short = (minutes: number) => {
    if (minutes <= 0) return ''
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium text-muted-foreground">
              {technicianHeader}
            </th>
            {sheet.dayKeys.map((day) => (
              <th
                key={day}
                className={cn(
                  'min-w-14 px-1 py-2 text-center font-medium',
                  isWeekend(day) ? 'text-muted-foreground/60' : 'text-muted-foreground',
                  day === todayKey && 'text-primary'
                )}
                title={dayLabel(day, 'long')}
              >
                <div className="leading-tight">
                  {dayLabel(day, 'short')
                    .split(' ')[0]
                    .replace(/[,.]+$/, '')}
                </div>
                <div className="font-normal opacity-70">{day.slice(8)}</div>
              </th>
            ))}
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">
              {totalHeader}
            </th>
          </tr>
        </thead>
        <tbody>
          {sheet.technicians.map((s) => (
            <tr key={s.technician.id} className="border-b last:border-b-0">
              <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                <span className="flex items-center gap-2 whitespace-nowrap font-medium">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.technician.color }}
                  />
                  {s.technician.name}
                </span>
              </td>
              {sheet.dayKeys.map((day) => {
                const minutes = s.byDay.get(day) ?? 0
                return (
                  <td key={day} className="p-0.5">
                    <a
                      href={`#day-${s.technician.id}-${day}`}
                      className={cn(
                        'flex h-8 items-center justify-center rounded font-mono tabular-nums transition-colors',
                        minutes > 0 ? 'hover:ring-1 hover:ring-primary/50' : 'text-transparent',
                        isWeekend(day) && minutes === 0 && 'bg-muted/40'
                      )}
                      style={shade(minutes)}
                      aria-label={`${s.technician.name}, ${dayLabel(day, 'long')}: ${formatMinutes(minutes)}`}
                    >
                      {short(minutes)}
                    </a>
                  </td>
                )
              })}
              <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                {formatMinutes(s.totalMinutes)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/30">
            <td className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 font-medium text-muted-foreground backdrop-blur">
              {totalHeader}
            </td>
            {sheet.dayKeys.map((day) => (
              <td key={day} className="px-1 py-1.5 text-center font-mono tabular-nums">
                {short(sheet.dayTotals.get(day) ?? 0)}
              </td>
            ))}
            <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
              {formatMinutes(sheet.totalMinutes)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function TechnicianCard({
  sheet,
  now,
  timeZone,
  canEdit,
  dayLabel,
  formatTime,
  stoppingId,
  onEdit,
  onStop,
  onDelete,
  onAdd,
}: {
  sheet: TechnicianSheet
  now: Date
  timeZone: string
  canEdit: boolean
  dayLabel: (dayKey: string, style: 'short' | 'long') => string
  formatTime: (date: string) => string
  stoppingId: string | null
  onEdit: (entry: SheetEntry) => void
  onStop: (entry: SheetEntry) => void
  onDelete: (entry: SheetEntry) => void
  onAdd: (dayKey: string) => void
}) {
  const t = useTranslations('timeTracking.page.table')
  const tPage = useTranslations('timeTracking.page')

  // Entries grouped under the day they started, newest day first, newest
  // stretch first within it. A stretch that crossed midnight is listed once,
  // under its start; the grid above already splits its minutes.
  const days = useMemo(() => {
    const map = new Map<string, SheetEntry[]>()
    for (const e of sheet.entries) {
      const key = zonedDayKey(new Date(e.startedAt), timeZone)
      const list = map.get(key) ?? []
      list.push(e)
      map.set(key, list)
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([key, list]) => ({
        key,
        entries: list.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)),
        minutes: list.reduce((sum, e) => sum + entryMinutes(e, now), 0),
      }))
  }, [sheet.entries, timeZone, now])

  return (
    <AppCard
      title={
        <span className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: sheet.technician.color }}
          />
          {sheet.technician.name}
          {sheet.technician.linked === false && (
            // Two rows can share a name; this is what tells them apart.
            <span
              className="rounded border px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
              title={tPage('unlinkedHint')}
            >
              {tPage('unlinked')}
            </span>
          )}
        </span>
      }
      badge={formatMinutes(sheet.totalMinutes)}
      contentClassName="p-0"
    >
      {days.map((day) => (
        <section
          key={day.key}
          id={`day-${sheet.technician.id}-${day.key}`}
          className="scroll-mt-20"
        >
          <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
            <span className="font-medium">{dayLabel(day.key, 'long')}</span>
            <span className="ml-auto font-mono tabular-nums text-muted-foreground">
              {t('dayTotal')}: {formatMinutes(day.minutes)}
            </span>
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => onAdd(day.key)}
                aria-label={t('actions')}
                title={t('actions')}
              >
                <Plus className="size-3.5" />
              </Button>
            )}
          </div>

          {/* Table above md */}
          <table className="hidden w-full text-sm md:table">
            <tbody>
              {day.entries.map((e) => (
                <EntryRow
                  key={e.id}
                  entry={e}
                  now={now}
                  canEdit={canEdit}
                  formatTime={formatTime}
                  stoppingId={stoppingId}
                  onEdit={onEdit}
                  onStop={onStop}
                  onDelete={onDelete}
                />
              ))}
            </tbody>
          </table>

          {/* Cards below md */}
          <ul className="divide-y md:hidden">
            {day.entries.map((e) => (
              <EntryCard
                key={e.id}
                entry={e}
                now={now}
                canEdit={canEdit}
                formatTime={formatTime}
                stoppingId={stoppingId}
                onEdit={onEdit}
                onStop={onStop}
                onDelete={onDelete}
              />
            ))}
          </ul>
        </section>
      ))}
    </AppCard>
  )
}

type RowProps = {
  entry: SheetEntry
  now: Date
  canEdit: boolean
  formatTime: (date: string) => string
  stoppingId: string | null
  onEdit: (entry: SheetEntry) => void
  onStop: (entry: SheetEntry) => void
  onDelete: (entry: SheetEntry) => void
}

function EntryActions({ entry, canEdit, stoppingId, onEdit, onStop, onDelete }: RowProps) {
  const t = useTranslations('timeTracking.page.table')
  if (!canEdit) return null
  const running = !entry.endedAt
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label={t('actions')}
          disabled={stoppingId === entry.id}
        >
          {stoppingId === entry.id ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {running && (
          <DropdownMenuItem onClick={() => onStop(entry)}>
            <Square className="size-3.5 fill-current" />
            {t('stop')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onEdit(entry)}>
          <Pencil className="size-3.5" />
          {t('edit')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onDelete(entry)}>
          <Trash2 className="size-3.5" />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function EntryRow(props: RowProps) {
  const { entry, now, formatTime } = props
  const t = useTranslations('timeTracking.page.table')
  const running = !entry.endedAt
  return (
    <tr className={cn('border-b last:border-b-0', running && 'bg-primary/5')}>
      <td className="whitespace-nowrap px-3 py-2 font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(entry.startedAt)}
        <span className="mx-1 opacity-60">–</span>
        {running ? (
          <span className="text-primary">{t('running')}</span>
        ) : (
          formatTime(entry.endedAt as string)
        )}
      </td>
      <td className="w-24 whitespace-nowrap px-3 py-2 font-mono text-sm font-medium tabular-nums">
        {running
          ? formatElapsed(now.getTime() - new Date(entry.startedAt).getTime())
          : formatMinutes(entryMinutes(entry, now))}
      </td>
      <td className="max-w-64 px-3 py-2">
        <Link href={jobHref(entry)} className="block truncate hover:underline">
          {entry.job.title}
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
        {entry.job.licensePlate ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded border px-1 font-mono text-[11px] font-semibold uppercase text-foreground">
              {entry.job.licensePlate}
            </span>
            <span className="hidden xl:inline">{entry.job.vehicleLabel}</span>
          </span>
        ) : (
          (entry.job.vehicleLabel ?? t('counterSale'))
        )}
      </td>
      <td className="px-3 py-2">
        <SourceBadge source={entry.source} editedByName={entry.editedByName} />
      </td>
      <td
        className="max-w-56 truncate px-3 py-2 text-xs text-muted-foreground"
        title={entry.note ?? ''}
      >
        {entry.note}
      </td>
      <td className="w-10 px-2 py-1 text-right">
        <EntryActions {...props} />
      </td>
    </tr>
  )
}

function EntryCard(props: RowProps) {
  const { entry, now, formatTime } = props
  const t = useTranslations('timeTracking.page.table')
  const running = !entry.endedAt
  return (
    <li className={cn('flex items-start gap-3 px-3 py-2.5', running && 'bg-primary/5')}>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatTime(entry.startedAt)}
            {' – '}
            {running ? (
              <span className="text-primary">{t('running')}</span>
            ) : (
              formatTime(entry.endedAt as string)
            )}
          </span>
          <span className="ml-auto font-mono text-sm font-medium tabular-nums">
            {running
              ? formatElapsed(now.getTime() - new Date(entry.startedAt).getTime())
              : formatMinutes(entryMinutes(entry, now))}
          </span>
        </div>
        <Link href={jobHref(entry)} className="block truncate text-sm hover:underline">
          {entry.job.title}
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {entry.job.licensePlate && (
            <span className="rounded border px-1 font-mono text-[11px] font-semibold uppercase text-foreground">
              {entry.job.licensePlate}
            </span>
          )}
          <SourceBadge source={entry.source} editedByName={entry.editedByName} />
          {entry.note && <span className="truncate">{entry.note}</span>}
        </div>
      </div>
      <EntryActions {...props} />
    </li>
  )
}

/** Exposed for the CSV button's filename and tests; keeps the day math in one place. */
export { presetRange }
