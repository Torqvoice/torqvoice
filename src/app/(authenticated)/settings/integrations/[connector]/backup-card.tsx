'use client'

import { type ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { DocsLink } from '@/components/docs-link'
import { DatabaseBackup, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { handleGated } from '@/components/upgrade-gate'
import { runBackupNow } from '@/features/integrations/Actions/backupActions'
import type {
  BackupOverview,
  BackupRunStatus,
  BackupRunView,
} from '@/features/integrations/Lib/backup-types'

const UNITS = ['KB', 'MB', 'GB'] as const

/** Bytes as B, KB, MB or GB with one decimal; GB is the largest unit. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes || 0))} B`
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`
}

function statusClass(status: BackupRunStatus): string {
  if (status === 'failed') return 'border-destructive/30 text-destructive'
  if (status === 'done') return 'border-emerald-500/30 text-emerald-600'
  if (status === 'running') return 'border-primary/30 text-primary'
  return 'text-muted-foreground'
}

/**
 * Backups for one destination: when the last good one ran, when the next is
 * due, what the repository holds, and the last ten runs. While a run is in
 * progress the page refreshes itself every ten seconds.
 */
export function BackupCard({
  connectorId,
  backup,
  docs,
}: {
  connectorId: string
  backup: BackupOverview
  /** The integration's docs page, where restoring is described. */
  docs: string
}) {
  const t = useTranslations('integrations.connection.backup')
  const tc = useTranslations('integrations')
  const format = useFormatter()
  const now = useNow({ updateInterval: backup.running ? 1_000 : 60_000 })
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!backup.running) return
    const id = setInterval(() => router.refresh(), 10_000)
    return () => clearInterval(id)
  }, [backup.running, router])

  const backUpNow = async () => {
    setBusy(true)
    try {
      const res = await runBackupNow(connectorId)
      if (!res.success) {
        if (!handleGated(res)) toast.error(res.error || tc('errors.generic'))
        return
      }
      toast.success(t('started'))
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  const when = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: 'medium', timeStyle: 'short' })

  const duration = (run: BackupRunView): string => {
    if (!run.startedAt) return '-'
    const end = run.finishedAt ? new Date(run.finishedAt) : run.status === 'running' ? now : null
    if (!end) return '-'
    const seconds = Math.max(
      0,
      Math.round((end.getTime() - new Date(run.startedAt).getTime()) / 1000)
    )
    const unit = (value: number, u: 'hour' | 'minute' | 'second') =>
      format.number(value, { style: 'unit', unit: u, unitDisplay: 'narrow' })
    if (seconds < 60) return unit(seconds, 'second')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${unit(minutes, 'minute')} ${unit(seconds % 60, 'second')}`
    return `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}`
  }

  const count = (n: number | null) => (n == null ? '-' : format.number(n))
  const bytes = (n: number | null) => (n == null ? '-' : formatBytes(n))
  const runs = backup.recent.slice(0, 10)

  return (
    <AppCard
      icon={DatabaseBackup}
      title={t('title')}
      description={t('description')}
      action={
        <Button size="sm" onClick={backUpNow} disabled={busy || backup.running}>
          {busy || backup.running ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <DatabaseBackup className="mr-1 h-3.5 w-3.5" />
          )}
          {backup.running ? t('running') : t('runNow')}
        </Button>
      }
      contentClassName="space-y-4"
    >
      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('lastGood')}</p>
          {backup.lastGood?.finishedAt ? (
            <>
              <p className="font-medium" suppressHydrationWarning>
                {format.relativeTime(new Date(backup.lastGood.finishedAt), now)}
              </p>
              {backup.lastGood.bytesAdded != null && (
                <p className="text-xs text-muted-foreground">
                  {t('added', { size: formatBytes(backup.lastGood.bytesAdded) })}
                </p>
              )}
            </>
          ) : (
            <p className="font-medium">{t('never')}</p>
          )}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('nextRun')}</p>
          <p className="font-medium">
            {backup.nextRunAt ? when(backup.nextRunAt) : t('notScheduled')}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('repositorySize')}</p>
          <p className="font-medium">
            {backup.repositorySize == null ? '-' : formatBytes(backup.repositorySize)}
          </p>
        </div>
      </div>

      {backup.running && <p className="text-xs text-muted-foreground">{t('runningHint')}</p>}

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('recentTitle')}</p>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRuns')}</p>
        ) : (
          <>
            {/* Phones and portrait tablets get one card per run. */}
            <div className="space-y-2 md:hidden">
              {runs.map((run) => (
                <div key={run.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {run.startedAt ? when(run.startedAt) : t('notStarted')}
                    </span>
                    <RunStatus status={run.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`trigger.${run.trigger}`)} · {duration(run)} ·{' '}
                    {t('filesNewCount', { count: run.filesNew ?? 0 })} · {bytes(run.bytesAdded)}
                  </p>
                  {run.error && (
                    <p className="mt-1 break-words text-xs text-destructive">{run.error}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="hidden overflow-hidden rounded-lg border md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('columns.status')}</TableHead>
                    <TableHead>{t('columns.started')}</TableHead>
                    <TableHead>{t('columns.trigger')}</TableHead>
                    <TableHead className="text-right">{t('columns.duration')}</TableHead>
                    <TableHead className="text-right">{t('columns.filesNew')}</TableHead>
                    <TableHead className="text-right">{t('columns.bytesAdded')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((run) => (
                    <BackupRunRows key={run.id} run={run}>
                      <TableCell>
                        <RunStatus status={run.status} />
                      </TableCell>
                      <TableCell>{run.startedAt ? when(run.startedAt) : t('notStarted')}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`trigger.${run.trigger}`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{duration(run)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {count(run.filesNew)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bytes(run.bytesAdded)}
                      </TableCell>
                    </BackupRunRows>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
        {/* The way back sits with the backups, so nobody has to go looking
            for it on the day it matters. */}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span>{t('restoreHint')}</span>
          <DocsLink href={docs} variant="inline" />
        </p>
      </div>
    </AppCard>
  )
}

function RunStatus({ status }: { status: BackupRunStatus }) {
  const t = useTranslations('integrations.connection.backup.status')
  return (
    <Badge variant="outline" className={`text-[11px] font-normal ${statusClass(status)}`}>
      {status === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {t(status)}
    </Badge>
  )
}

/** One run's row, plus a full-width row under it for the error when there is one. */
function BackupRunRows({ run, children }: { run: BackupRunView; children: ReactNode }) {
  return (
    <>
      <TableRow className={run.error ? 'border-b-0' : undefined}>{children}</TableRow>
      {run.error && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={6}
            className="pt-0 text-xs whitespace-normal break-words text-destructive"
          >
            {run.error}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
