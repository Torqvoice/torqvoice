'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import {
  ChevronDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Square,
  Timer,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirm } from '@/components/confirm-dialog'
import { deleteTimeEntry, stopTimeEntry } from '../Actions/timesheetActions'
import { TimeEntryDialog } from './TimeEntryDialog'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { getJobClock, type JobClock } from '../Actions/timeClockActions'
import {
  entryMinutes,
  formatElapsed,
  formatMinutes,
  minutesToBillableHours,
  type SheetEntry,
} from '../Lib/timesheet'
import { useClockEvents, useTimeClock } from './TimeClockProvider'
import { useTick } from '../hooks/useTick'
import { SourceBadge } from './SourceBadge'

const COLLAPSED_ROWS = 5

/**
 * Clocked time on one work order, beside the labor it will be billed as.
 *
 * Shows every stretch anyone has clocked here, a running one ticking. The
 * start and stop buttons live on the dashboard's active jobs list, where a
 * technician already is; this page is the record. "Add as labor" carries the
 * total into a labor line the way the phone does after a stop, rounded to a
 * billable quarter hour; the clocked record itself is never changed by it.
 */
export function JobClockSection({
  serviceRecordId,
  initial,
  onAddLabor,
}: {
  serviceRecordId: string
  initial: JobClock
  onAddLabor: (hours: number) => void
}) {
  const t = useTranslations('timeTracking.job')
  const tPage = useTranslations('timeTracking.page')
  const { formatTime } = useFormatDate()
  const clock = useTimeClock()
  const confirm = useConfirm()
  const [entries, setEntries] = useState<SheetEntry[]>(initial.entries)
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<SheetEntry | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { canEdit, timeZone } = initial

  const reload = useCallback(async () => {
    const result = await getJobClock(serviceRecordId)
    if (result.success && result.data) setEntries(result.data.entries)
  }, [serviceRecordId])

  // Anyone's clock on this job, from any device.
  useClockEvents((event) => {
    if (event.serviceRecordId === serviceRecordId) void reload()
  })

  // The provider's own start and stop resolve before the socket frame lands.
  // Skipped on mount: the server already rendered the current list.
  const ownRunningHere = clock.open?.serviceRecordId === serviceRecordId
  const mounted = useRef(false)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      return
    }
    void reload()
  }, [ownRunningHere, reload])

  const anyRunning = entries.some((e) => !e.endedAt)
  const now = useTick(anyRunning)

  const totalMinutes = useMemo(
    () => entries.reduce((sum, e) => sum + entryMinutes(e, now), 0),
    [entries, now]
  )

  const perTechnician = useMemo(() => {
    const map = new Map<
      string,
      { name: string; color: string; minutes: number; running: boolean }
    >()
    for (const e of entries) {
      const row = map.get(e.technicianId) ?? {
        name: e.technicianName,
        color: e.technicianColor,
        minutes: 0,
        running: false,
      }
      row.minutes += entryMinutes(e, now)
      if (!e.endedAt) row.running = true
      map.set(e.technicianId, row)
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes)
  }, [entries, now])

  const newestFirst = useMemo(() => [...entries].reverse(), [entries])
  const visible = expanded ? newestFirst : newestFirst.slice(0, COLLAPSED_ROWS)
  const hidden = newestFirst.length - visible.length

  const billableHours = minutesToBillableHours(totalMinutes)

  // Corrections, gated on the time tracking edit permission rather than on
  // being allowed to clock: a technician's own record is not theirs to edit.
  const handleStop = async (entry: SheetEntry) => {
    setBusyId(entry.id)
    const result = await stopTimeEntry(entry.id)
    setBusyId(null)
    if (!result.success || !result.data) {
      toast.error(result.error ?? tPage('loadFailed'))
      return
    }
    toast.success(
      tPage('stoppedByManager', { minutes: formatMinutes(result.data.durationMinutes ?? 0) })
    )
    void reload()
  }

  const handleDelete = async (entry: SheetEntry) => {
    const ok = await confirm({
      title: tPage('deleteTitle'),
      description: tPage('deleteBody', {
        duration: formatMinutes(entryMinutes(entry, now)),
        job: entry.job.title,
        technician: entry.technicianName,
      }),
      confirmLabel: tPage('deleteConfirm'),
      destructive: true,
    })
    if (!ok) return
    setBusyId(entry.id)
    const result = await deleteTimeEntry(entry.id)
    setBusyId(null)
    if (!result.success) {
      toast.error(result.error ?? tPage('loadFailed'))
      return
    }
    toast.success(tPage('deleted'))
    void reload()
  }

  return (
    <div className="@container space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Timer className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{t('title')}</h3>
          <Badge variant="secondary" className="font-mono tabular-nums">
            {formatMinutes(totalMinutes)}
          </Badge>
          {anyRunning && (
            <span className="relative flex size-2" aria-label={t('running')}>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {totalMinutes > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => onAddLabor(billableHours)}
              title={t('addAsLaborHint', { hours: billableHours })}
            >
              <Plus className="size-3.5" />
              {t('addAsLabor', { hours: billableHours })}
            </Button>
          )}
        </div>
      </div>

      {perTechnician.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {perTechnician.map((row) => (
            <span
              key={row.name}
              className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 px-2 py-0.5 text-xs"
            >
              <span
                className={cn('size-2 rounded-full', row.running && 'ring-2 ring-primary/40')}
                style={{ backgroundColor: row.color }}
              />
              <span className="text-muted-foreground">{row.name}</span>
              <span className="font-medium tabular-nums">{formatMinutes(row.minutes)}</span>
            </span>
          ))}
        </div>
      )}

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t('empty')}
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {visible.map((e) => {
            const running = !e.endedAt
            const minutes = entryMinutes(e, now)
            return (
              <li
                key={e.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs',
                  running && 'bg-primary/5'
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: e.technicianColor }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate font-medium">{e.technicianName}</span>
                <span className="tabular-nums text-muted-foreground">
                  {formatTime(e.startedAt)}
                  {' – '}
                  {running ? (
                    <span className="text-primary">{t('running')}</span>
                  ) : (
                    formatTime(e.endedAt as string)
                  )}
                </span>
                <span className="w-16 text-right font-mono tabular-nums">
                  {running
                    ? formatElapsed(now.getTime() - new Date(e.startedAt).getTime())
                    : formatMinutes(minutes)}
                </span>
                <SourceBadge source={e.source} editedByName={e.editedByName} />
                {canEdit && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0"
                        aria-label={tPage('table.actions')}
                        disabled={busyId === e.id}
                      >
                        {busyId === e.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="size-3.5" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {running && (
                        <DropdownMenuItem onClick={() => void handleStop(e)}>
                          <Square className="size-3.5 fill-current" />
                          {tPage('table.stop')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => setEditing(e)}>
                        <Pencil className="size-3.5" />
                        {tPage('table.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(e)}>
                        <Trash2 className="size-3.5" />
                        {tPage('table.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {e.note && (
                  <span className="basis-full truncate text-muted-foreground" title={e.note}>
                    {e.note}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {(hidden > 0 || expanded) && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
            />
            {expanded ? t('showFewer') : t('showAll', { count: hidden })}
          </button>
          <Link href="/timesheets" className="text-xs text-muted-foreground hover:text-foreground">
            {t('openTimesheets')}
          </Link>
        </div>
      )}

      {canEdit && (
        <TimeEntryDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          timeZone={timeZone}
          technicians={[]}
          entry={editing}
          onSaved={() => void reload()}
        />
      )}
    </div>
  )
}
