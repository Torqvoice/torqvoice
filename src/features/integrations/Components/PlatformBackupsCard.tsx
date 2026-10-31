'use client'

import { type ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
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
import { getPlatformBackupStatus } from '@/features/integrations/Actions/getPlatformBackupStatus'
import { runPlatformBackupNow } from '@/features/integrations/Actions/runPlatformBackupNow'
import { PlatformRestoreDialog } from '@/features/integrations/Components/PlatformRestoreDialog'
import { useActionErrorText } from '@/features/integrations/Hooks/useBackupSnapshots'
import { formatBytes } from '@/features/integrations/Lib/format-bytes'
import type {
  BackupRunStatus,
  BackupRunView,
  PlatformBackupOverview,
  PlatformSnapshotView,
} from '@/features/integrations/Lib/backup-types'
import type { ReauthRequirement } from '@/lib/reauth'

/** Where a workshop changes its plan; platform backups exist on the cloud only. */
const PLAN_HREF = '/settings/subscription'

/** Restore points listed before Show all; the repository keeps a few dozen. */
const POINTS_SHOWN = 10

function statusClass(status: BackupRunStatus): string {
  if (status === 'failed') return 'border-destructive/30 text-destructive'
  if (status === 'done') return 'border-emerald-500/30 text-emerald-600'
  if (status === 'running') return 'border-primary/30 text-primary'
  return 'text-muted-foreground'
}

/**
 * Backups by Torqvoice, on Settings, Data of the cloud instance: when the
 * last good one ran, when the next is due, the restore points the workshop
 * can go back to and the last runs. On a plan without them it says so, and
 * while a paused repository waits out its grace period it says until when.
 * While a backup or a restore is in progress the card asks for its own data
 * every ten seconds, which works during a restore when the rest of the page's
 * data is refused, and refreshes the page once the run is done.
 */
export function PlatformBackupsCard({
  overview: initial,
  reauth,
  now,
}: {
  overview: PlatformBackupOverview
  /** What the restore dialog asks for before the server will go ahead. */
  reauth: ReauthRequirement
  now: Date
}) {
  const t = useTranslations('settings.data.platformBackups')
  const format = useFormatter()
  const router = useRouter()
  const errorText = useActionErrorText()
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [target, setTarget] = useState<PlatformSnapshotView | null>(null)
  // What the polling read, for as long as the page has not sent newer data.
  const [live, setLive] = useState<{
    from: PlatformBackupOverview
    data: PlatformBackupOverview
  } | null>(null)
  const overview = live && live.from === initial ? live.data : initial

  useEffect(() => {
    if (!overview.running) return
    const id = setInterval(async () => {
      const res = await getPlatformBackupStatus().catch(() => null)
      if (!res?.success || !res.data) return
      setLive({ from: initial, data: res.data })
      if (!res.data.running) router.refresh()
    }, 10_000)
    return () => clearInterval(id)
  }, [overview.running, initial, router])

  const backUpNow = async () => {
    setBusy(true)
    try {
      const res = await runPlatformBackupNow()
      if (!res.success) {
        if (!handleGated(res)) toast.error(errorText(res.error))
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

  const planLink = (
    <Link href={PLAN_HREF} className="font-medium text-primary underline-offset-2 hover:underline">
      {t('planLink')}
    </Link>
  )

  if (!overview.active) {
    return (
      <AppCard icon={DatabaseBackup} title={t('title')} description={t('description')}>
        <p className="text-sm text-muted-foreground">
          {overview.paused
            ? t('paused', {
                date: overview.purgeDueAt
                  ? format.dateTime(new Date(overview.purgeDueAt), { dateStyle: 'long' })
                  : '-',
              })
            : t('upsell')}{' '}
          {planLink}
        </p>
      </AppCard>
    )
  }

  // The run the queue holds for the workshop, when there is one.
  const open = overview.recent.find((r) => r.status === 'queued' || r.status === 'running')
  const runningLabel = overview.restoring
    ? t('restoring')
    : open?.status === 'queued'
      ? overview.queuedAhead > 0
        ? t('queuedAhead', { count: overview.queuedAhead })
        : t('queued')
      : t('running')

  const points = [...overview.snapshots].sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
  const shownPoints = showAll ? points : points.slice(0, POINTS_SHOWN)
  const mayRestore = overview.canRestore && !overview.running
  const runs = overview.recent.slice(0, 10)

  return (
    <AppCard
      icon={DatabaseBackup}
      title={t('title')}
      description={t('description')}
      action={
        <Button size="sm" onClick={backUpNow} disabled={busy || overview.running}>
          {busy || overview.running ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <DatabaseBackup className="mr-1 h-3.5 w-3.5" />
          )}
          {t('runNow')}
        </Button>
      }
      contentClassName="space-y-4"
    >
      <div className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">{t('lastGood')}</p>
          <p className="flex flex-wrap items-center gap-2 font-medium">
            <span suppressHydrationWarning>
              {overview.lastGoodAt
                ? format.relativeTime(new Date(overview.lastGoodAt), now)
                : t('never')}
            </span>
            {overview.running && (
              <Badge
                variant="outline"
                className="border-primary/30 text-[11px] font-normal text-primary"
              >
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {runningLabel}
              </Badge>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('nextRun')}</p>
          <p className="font-medium">
            {overview.nextRunAt ? when(overview.nextRunAt) : t('notScheduled')}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t('repositorySize')}</p>
          <p className="font-medium">
            {overview.repositorySize == null ? '-' : formatBytes(overview.repositorySize)}
          </p>
        </div>
      </div>

      {overview.restoring ? (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          {t('restoringHint')}
        </p>
      ) : (
        overview.running && <p className="text-xs text-muted-foreground">{t('runningHint')}</p>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('pointsTitle')}</p>
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pointsEmpty')}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.when')}</TableHead>
                  <TableHead>{t('columns.kind')}</TableHead>
                  <TableHead className="text-right">{t('columns.size')}</TableHead>
                  <TableHead className="w-px" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {shownPoints.map((point) => (
                  <TableRow key={point.id}>
                    <TableCell>{when(point.time)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {point.preRestore ? (
                        <>
                          <span className="text-foreground">{t('kind.safety')}</span>
                          <span className="block text-xs whitespace-normal">
                            {t('kind.safetyHint')}
                          </span>
                        </>
                      ) : point.trigger === 'manual' ? (
                        t('kind.manual')
                      ) : (
                        t('kind.scheduled')
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {point.bytes == null ? '-' : formatBytes(point.bytes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {/* Open to look inside; the page refuses anyone but an admin. */}
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/settings/data/restore-points/${point.id}?source=platform`}>
                            {t('explore')}
                          </Link>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setTarget(point)}
                          disabled={!mayRestore}
                        >
                          {t('restore.action')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {points.length > 0 && <p className="text-xs text-muted-foreground">{t('sizeNote')}</p>}
        {(points.length > POINTS_SHOWN || !overview.canRestore) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {points.length > POINTS_SHOWN && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? t('showFewer') : t('showAll', { count: points.length })}
              </Button>
            )}
            {!overview.canRestore && points.length > 0 && <span>{t('needsOwner')}</span>}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t('recentTitle')}</p>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('noRuns')}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columns.status')}</TableHead>
                  <TableHead>{t('columns.when')}</TableHead>
                  <TableHead>{t('columns.trigger')}</TableHead>
                  <TableHead className="text-right">{t('columns.duration')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <RunRows
                    key={run.id}
                    reason={
                      run.trigger === 'restore' && run.reason
                        ? t('supportReason', { reason: run.reason })
                        : null
                    }
                    error={run.error}
                  >
                    <TableCell>
                      <RunStatus status={run.status} />
                    </TableCell>
                    <TableCell>{run.startedAt ? when(run.startedAt) : t('notStarted')}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {t(`trigger.${run.trigger}`)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{duration(run)}</TableCell>
                  </RunRows>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <PlatformRestoreDialog
        workshopName={overview.workshopName}
        reauth={reauth}
        target={target}
        onClose={() => setTarget(null)}
      />
    </AppCard>
  )
}

function RunStatus({ status }: { status: BackupRunStatus }) {
  const t = useTranslations('settings.data.platformBackups.status')
  return (
    <Badge variant="outline" className={`text-[11px] font-normal ${statusClass(status)}`}>
      {status === 'running' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
      {t(status)}
    </Badge>
  )
}

/** One row, plus a full-width row under it for the support reason or the error. */
function RunRows({
  reason,
  error,
  children,
}: {
  reason: string | null
  error: string | null
  children: ReactNode
}) {
  const notes = Boolean(reason || error)
  return (
    <>
      <TableRow className={notes ? 'border-b-0' : undefined}>{children}</TableRow>
      {notes && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={4} className="space-y-0.5 pt-0 text-xs whitespace-normal break-words">
            {reason && <p className="text-muted-foreground">{reason}</p>}
            {error && <p className="text-destructive">{error}</p>}
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
