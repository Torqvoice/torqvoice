'use client'

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useNow, useTranslations } from 'next-intl'
import { DatabaseBackup, History, Loader2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { DocsLink } from '@/components/docs-link'
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
import {
  RestoreBackupDialog,
  type RestoreTarget,
} from '@/features/integrations/Components/RestoreBackupDialog'
import {
  type BackupSnapshot,
  useBackupSnapshots,
} from '@/features/integrations/Hooks/useBackupSnapshots'
import { formatBytes } from '@/features/integrations/Lib/format-bytes'
import type {
  BackupOverview,
  BackupRunStatus,
  BackupRunView,
} from '@/features/integrations/Lib/backup-types'

function statusClass(status: BackupRunStatus): string {
  if (status === 'failed') return 'border-destructive/30 text-destructive'
  if (status === 'done') return 'border-emerald-500/30 text-emerald-600'
  if (status === 'running') return 'border-primary/30 text-primary'
  return 'text-muted-foreground'
}

/**
 * One line of the table: a run this install recorded, or a backup found in
 * the repository that no recent run accounts for (older than the last ten,
 * or taken by an earlier install of the workshop).
 */
interface BackupRow {
  key: string
  status: BackupRunStatus
  startedAt: string | null
  trigger: BackupRunView['trigger']
  run: BackupRunView | null
  filesNew: number | null
  bytesAdded: number | null
  error: string | null
  /** What Restore puts back, when the row is a backup that finished. */
  restore: RestoreTarget | null
  /** Taken by an earlier install of this workshop. */
  earlierInstall: boolean
}

function rowOfRun(run: BackupRunView): BackupRow {
  const restorable = run.status === 'done' && run.trigger !== 'restore' && run.snapshotId
  return {
    key: run.id,
    status: run.status,
    startedAt: run.startedAt,
    trigger: run.trigger,
    run,
    filesNew: run.filesNew,
    bytesAdded: run.bytesAdded,
    error: run.error,
    restore:
      restorable && run.snapshotId
        ? { snapshotId: run.snapshotId, time: run.finishedAt ?? run.startedAt ?? '', files: null }
        : null,
    earlierInstall: false,
  }
}

function rowOfSnapshot(s: BackupSnapshot): BackupRow {
  return {
    key: `snapshot:${s.id}`,
    status: 'done',
    startedAt: s.time,
    trigger: s.trigger ?? 'manual',
    run: null,
    filesNew: s.filesNew,
    bytesAdded: s.dataAdded,
    error: null,
    restore: { snapshotId: s.id, time: s.time, files: s.files },
    earlierInstall: !s.thisWorkshop,
  }
}

/**
 * Backups for one destination: when the last good one ran, when the next is
 * due, what the repository holds, and the last ten runs, each finished
 * backup with a Restore action. Show all backups adds what the repository
 * holds beyond those ten to the same table. Only an owner (or, self-hosted,
 * an administrator) may restore; everyone else sees the actions disabled
 * and who has the right. While a backup or a restore is in progress the
 * page refreshes itself every ten seconds.
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
  const [showAll, setShowAll] = useState(false)
  const [target, setTarget] = useState<RestoreTarget | null>(null)
  const snapshots = useBackupSnapshots(backup.organizationId, connectorId, showAll)

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

  const duration = (run: BackupRunView | null): string => {
    if (!run?.startedAt) return '-'
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

  // The last ten runs, and once asked for, every backup in the repository
  // that none of them accounts for, in one list by time.
  const runs = backup.recent.slice(0, 10)
  const known = new Set(runs.map((r) => r.snapshotId).filter(Boolean))
  const rows: BackupRow[] = runs.map(rowOfRun)
  if (showAll && snapshots.data) {
    for (const s of snapshots.data) if (!known.has(s.id)) rows.push(rowOfSnapshot(s))
    rows.sort((a, b) => Date.parse(b.startedAt ?? '') - Date.parse(a.startedAt ?? ''))
  }

  const mayRestore = backup.canRestore && !backup.running
  const restoreButton = (row: BackupRow) =>
    row.restore && (
      <div className="flex gap-2 md:justify-end">
        {/* Open to look inside; the page refuses anyone but an admin. */}
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/settings/data/restore-points/${row.restore.snapshotId}?source=${encodeURIComponent(connectorId)}`}
          >
            {t('explore')}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive hover:text-destructive"
          onClick={() => setTarget(row.restore)}
          disabled={!mayRestore}
        >
          {t('restore.action')}
        </Button>
      </div>
    )

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
          {backup.restoring ? t('restoring') : backup.running ? t('running') : t('runNow')}
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

      {backup.restoring ? (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          {t('restoringHint')}
        </p>
      ) : (
        backup.running && <p className="text-xs text-muted-foreground">{t('runningHint')}</p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('recentTitle')}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRuns')}</p>
        ) : (
          <>
            {/* Phones and portrait tablets get one card per run. */}
            <div className="space-y-2 md:hidden">
              {rows.map((row) => (
                <div key={row.key} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {row.startedAt ? when(row.startedAt) : t('notStarted')}
                      {row.earlierInstall && <EarlierInstall />}
                    </span>
                    <RunStatus status={row.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`trigger.${row.trigger}`)} · {duration(row.run)} ·{' '}
                    {t('filesNewCount', { count: row.filesNew ?? 0 })} · {bytes(row.bytesAdded)}
                  </p>
                  {row.error && (
                    <p className="mt-1 break-words text-xs text-destructive">{row.error}</p>
                  )}
                  {row.restore && <div className="mt-2">{restoreButton(row)}</div>}
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
                    <TableHead className="w-px" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <BackupRunRows key={row.key} error={row.error}>
                      <TableCell>
                        <RunStatus status={row.status} />
                      </TableCell>
                      <TableCell>
                        {row.startedAt ? when(row.startedAt) : t('notStarted')}
                        {row.earlierInstall && <EarlierInstall />}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {t(`trigger.${row.trigger}`)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{duration(row.run)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {count(row.filesNew)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {bytes(row.bytesAdded)}
                      </TableCell>
                      <TableCell className="text-right">{restoreButton(row)}</TableCell>
                    </BackupRunRows>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}

        {rows.length > 0 && <p className="text-xs text-muted-foreground">{t('addedNote')}</p>}

        {/* The way back sits with the runs: every finished backup can be put
            back from its row, and the repository's older ones join the list
            on request. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {showAll ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => snapshots.refetch()}
              disabled={snapshots.isFetching}
            >
              {snapshots.isFetching ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
              )}
              {t('restore.refresh')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setShowAll(true)}
              disabled={!backup.canRestore}
            >
              <History className="mr-1 h-3.5 w-3.5" />
              {t('restore.showAll')}
            </Button>
          )}
          {showAll && snapshots.isPending && <span>{t('restore.loading')}</span>}
          {showAll && snapshots.isError && (
            <span className="text-destructive">
              {t('restore.loadFailed')}: {snapshots.error.message}
            </span>
          )}
          {showAll && snapshots.isSuccess && snapshots.data.length === 0 && (
            <span>{t('restore.empty')}</span>
          )}
          {!backup.canRestore && (
            <span>
              {backup.restoreRole === 'owner' ? t('restore.needsOwner') : t('restore.needsAdmin')}
            </span>
          )}
          <DocsLink href={docs} variant="inline" />
        </div>
      </div>

      <RestoreBackupDialog
        connectorId={connectorId}
        workshopName={backup.workshopName}
        target={target}
        onClose={() => setTarget(null)}
      />
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

/** A backup another install of this workshop took, found in the same repository. */
function EarlierInstall() {
  const t = useTranslations('integrations.connection.backup.restore')
  return (
    <Badge variant="outline" className="ml-2 text-[11px] font-normal text-muted-foreground">
      {t('earlierInstall')}
    </Badge>
  )
}

/** One row, plus a full-width row under it for the error when there is one. */
function BackupRunRows({ error, children }: { error: string | null; children: ReactNode }) {
  return (
    <>
      <TableRow className={error ? 'border-b-0' : undefined}>{children}</TableRow>
      {error && (
        <TableRow className="hover:bg-transparent">
          <TableCell
            colSpan={7}
            className="pt-0 text-xs whitespace-normal break-words text-destructive"
          >
            {error}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
