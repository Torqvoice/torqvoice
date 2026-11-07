'use client'

import { type ComponentType, type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useFormatter, useTranslations } from 'next-intl'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  Eye,
  HardDrive,
  History,
  Loader2,
  Lock,
  MinusCircle,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppCard } from '@/components/app-card'
import { Button } from '@/components/ui/button'
import { handleGated } from '@/components/upgrade-gate'
import { getPlatformBackupStatus } from '@/features/integrations/Actions/getPlatformBackupStatus'
import { runPlatformBackupNow } from '@/features/integrations/Actions/runPlatformBackupNow'
import { PlatformRestoreDialog } from '@/features/integrations/Components/PlatformRestoreDialog'
import { useActionErrorText } from '@/features/integrations/Hooks/useBackupSnapshots'
import { formatBytes } from '@/features/integrations/Lib/format-bytes'
import type {
  BackupRunView,
  PlatformBackupOverview,
  PlatformSnapshotView,
} from '@/features/integrations/Lib/backup-types'
import type { ReauthRequirement } from '@/lib/reauth'
import { cn } from '@/lib/utils'

/** Where a workshop changes its plan; platform backups exist on the cloud only. */
const PLAN_HREF = '/settings/subscription'

/** Backups the list shows at first, and adds each time it is scrolled to its end. */
const PAGE_SIZE = 20

/** The example a workshop without backups sees: hourly points of about 101 MB. */
const EXAMPLE_POINTS = 8
const EXAMPLE_POINT_BYTES = 106_115_891
const EXAMPLE_REPOSITORY_BYTES = 200_697_446
/** How long before the page was opened the example's newest backup ran. */
const EXAMPLE_LAST_RUN_MS = 32 * 60_000
const HOUR_MS = 60 * 60_000

/** Hourly example restore points, newest first, ending a little before `now`. */
function examplePoints(now: Date): PlatformSnapshotView[] {
  const newest = now.getTime() - EXAMPLE_LAST_RUN_MS
  return Array.from({ length: EXAMPLE_POINTS }, (_, i) => ({
    id: `example-${i}`,
    shortId: `example${i}`,
    time: new Date(newest - i * HOUR_MS).toISOString(),
    bytes: EXAMPLE_POINT_BYTES,
    trigger: 'scheduled',
    preRestore: false,
  }))
}

/**
 * One line of the list: a restore point, with the run that took it when that
 * run is among the last ten, or a run that left no restore point behind (one
 * in progress, one that failed, or a restore).
 */
type BackupEntry =
  | { type: 'point'; key: string; time: string; point: PlatformSnapshotView }
  | { type: 'run'; key: string; time: string | null; run: BackupRunView }

/**
 * Every restore point and the runs worth seeing beside them, newest first.
 * A backup run that finished is its restore point, so it is not listed twice.
 * The stored points are refreshed after each backup: a finished run newer
 * than the newest point is one whose refresh failed, and shows as a run until
 * the next backup lists it; an older one missing from the points was let go
 * by the retention, and is left out with it.
 */
function backupEntries(overview: PlatformBackupOverview): BackupEntry[] {
  const entries: BackupEntry[] = overview.snapshots.map((point) => ({
    type: 'point',
    key: `point:${point.id}`,
    time: point.time,
    point,
  }))
  const listed = new Set(overview.snapshots.map((p) => p.id))
  const newestPoint = Math.max(...overview.snapshots.map((p) => Date.parse(p.time)))
  for (const run of overview.recent) {
    // A run the server gave up on before it started has only its finish.
    const time = run.startedAt ?? run.finishedAt
    if (run.trigger !== 'restore' && run.status === 'done') {
      const unlisted = !(run.snapshotId && listed.has(run.snapshotId))
      if (!unlisted || !time || Date.parse(time) <= newestPoint) continue
    }
    entries.push({ type: 'run', key: `run:${run.id}`, time, run })
  }
  // A queued run has no time yet; it is the newest thing there is.
  const at = (e: BackupEntry) => (e.time ? Date.parse(e.time) : Number.POSITIVE_INFINITY)
  return entries.sort((a, b) => at(b) - at(a))
}

/**
 * Backups by Torqvoice, on Settings, Data of the cloud instance: when the
 * last good one ran, when the next is due, and one list of the workshop's
 * backups by day, each restore point with its Explore and Restore actions
 * and the runs that left none (in progress, failed, or a restore) in their
 * place. The list shows twenty and adds twenty more each time it is scrolled
 * to its end. On a plan without them it shows a labelled example of the
 * card with a way to the plans, and while a paused repository waits out its
 * grace period it says until when. While a backup
 * or a restore is in progress the card asks for its own data every ten
 * seconds, which works during a restore when the rest of the page's data is
 * refused, and refreshes the page once the run is done.
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
  const tNav = useTranslations('settings.nav')
  const format = useFormatter()
  const router = useRouter()
  const errorText = useActionErrorText()
  const [busy, setBusy] = useState(false)
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

  if (!overview.active) {
    return (
      <AppCard
        id="platform-backups"
        icon={DatabaseBackup}
        title={t('title')}
        badge={tNav('pro')}
        description={t('description')}
        action={
          <Button size="sm" asChild>
            <Link href={PLAN_HREF}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              {t('planLink')}
            </Link>
          </Button>
        }
        contentClassName="pb-0"
        footer={
          <p className="flex items-start gap-2 text-sm">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              {overview.paused
                ? t('paused', {
                    date: overview.purgeDueAt
                      ? format.dateTime(new Date(overview.purgeDueAt), { dateStyle: 'long' })
                      : '-',
                  })
                : t('upsell')}
            </span>
          </p>
        }
      >
        <ExamplePreview now={now} />
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

  const entries = backupEntries(overview)
  const pointCount = overview.snapshots.length

  return (
    <AppCard
      id="platform-backups"
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
      footer={pointCount > 0 ? t('sizeNote') : undefined}
    >
      <dl className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={CheckCircle2}
          tone={overview.lastGoodAt ? 'good' : 'muted'}
          label={t('lastGood')}
        >
          <span suppressHydrationWarning>
            {overview.lastGoodAt
              ? format.relativeTime(new Date(overview.lastGoodAt), now)
              : t('never')}
          </span>
          {overview.running && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary ring-1 ring-inset ring-primary/20">
              <Loader2 className="h-3 w-3 animate-spin" />
              {runningLabel}
            </span>
          )}
        </Stat>
        <Stat icon={CalendarClock} label={t('nextRun')}>
          {overview.nextRunAt ? when(overview.nextRunAt) : t('notScheduled')}
        </Stat>
        <Stat icon={HardDrive} label={t('repositorySize')}>
          {overview.repositorySize == null ? '-' : formatBytes(overview.repositorySize)}
        </Stat>
      </dl>

      {overview.restoring ? (
        <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
          {t('restoringHint')}
        </p>
      ) : (
        overview.running && <p className="text-xs text-muted-foreground">{t('runningHint')}</p>
      )}

      <BackupList
        entries={entries}
        snapshots={overview.snapshots}
        pointCount={pointCount}
        canRestore={overview.canRestore}
        mayRestore={overview.canRestore && !overview.running}
        now={now}
        onRestore={setTarget}
      />

      <PlatformRestoreDialog
        workshopName={overview.workshopName}
        reauth={reauth}
        target={target}
        onClose={() => setTarget(null)}
      />
    </AppCard>
  )
}

type Tone = 'good' | 'muted'

/** One figure in the strip above the list. */
function Stat({
  icon: Icon,
  label,
  tone = 'muted',
  children,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-card-edge/70 bg-muted/30 px-3.5 py-3">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-inset',
          tone === 'good'
            ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400'
            : 'bg-background text-muted-foreground ring-border'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm font-semibold tracking-tight">
          {children}
        </dd>
      </div>
    </div>
  )
}

/**
 * What the card looks like on a plan with backups, filled with made-up
 * hourly restore points, so a workshop deciding whether to pay sees what it
 * would get. Sharp and readable, labelled as an example so nobody takes it
 * for the workshop's own backups, dimmed a little and faded out at the
 * bottom. Inert: nothing in it can be clicked, tabbed to or read aloud.
 */
function ExamplePreview({ now }: { now: Date }) {
  const t = useTranslations('settings.data.platformBackups')
  const format = useFormatter()
  const points = examplePoints(now)
  const entries: BackupEntry[] = points.map((point) => ({
    type: 'point',
    key: `point:${point.id}`,
    time: point.time,
    point,
  }))
  const lastRun = new Date(points[0].time)

  return (
    <div className="relative">
      <span className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-primary shadow-sm ring-1 ring-inset ring-primary/30">
        <Eye className="h-3.5 w-3.5" />
        {t('example')}
      </span>
      <div
        aria-hidden
        inert
        data-testid="platform-backups-example"
        className="pointer-events-none max-h-80 select-none space-y-4 overflow-hidden opacity-75 [mask-image:linear-gradient(to_bottom,black_40%,transparent)]"
      >
        <dl className="grid gap-3 sm:grid-cols-3">
          <Stat icon={CheckCircle2} tone="good" label={t('lastGood')}>
            <span suppressHydrationWarning>{format.relativeTime(lastRun, now)}</span>
          </Stat>
          <Stat icon={CalendarClock} label={t('nextRun')}>
            {format.dateTime(new Date(lastRun.getTime() + HOUR_MS), {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
          </Stat>
          <Stat icon={HardDrive} label={t('repositorySize')}>
            {formatBytes(EXAMPLE_REPOSITORY_BYTES)}
          </Stat>
        </dl>
        <BackupList
          entries={entries}
          snapshots={points}
          pointCount={points.length}
          canRestore
          mayRestore
          now={now}
          onRestore={() => undefined}
          example
        />
      </div>
    </div>
  )
}

/**
 * The backups, grouped by day under a header that stays in view while the
 * day scrolls past. Scrolls inside its own frame so the rest of Settings,
 * Data stays a short scroll away, and shows the next twenty as its end
 * comes into view.
 */
function BackupList({
  entries,
  snapshots,
  pointCount,
  canRestore,
  mayRestore,
  now,
  onRestore,
  example = false,
}: {
  entries: BackupEntry[]
  /** Every restore point, to name the one a restore went back to. */
  snapshots: PlatformSnapshotView[]
  pointCount: number
  canRestore: boolean
  mayRestore: boolean
  now: Date
  onRestore: (point: PlatformSnapshotView) => void
  /** Made-up points for the preview: nothing links to a restore point page. */
  example?: boolean
}) {
  const t = useTranslations('settings.data.platformBackups')
  const format = useFormatter()
  const [shown, setShown] = useState(PAGE_SIZE)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const sentinelRef = useRef<HTMLLIElement | null>(null)
  const hasMore = shown < entries.length

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      (seen) => {
        if (seen.some((e) => e.isIntersecting)) {
          setShown((n) => Math.min(n + PAGE_SIZE, entries.length))
        }
      },
      { root: scrollRef.current, rootMargin: '160px' }
    )
    observer.observe(sentinel)
    // Observed again after every page, so a sentinel still in view keeps loading.
    return () => observer.disconnect()
  }, [hasMore, shown, entries.length])

  // The day a backup belongs to, in the time zone the page formats in.
  const dayKey = (d: Date) =>
    format.dateTime(d, { year: 'numeric', month: '2-digit', day: '2-digit' })
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000))
  const dayLabel = (d: Date) => {
    const key = dayKey(d)
    if (key === today) return t('today')
    if (key === yesterday) return t('yesterday')
    return format.dateTime(d, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    })
  }

  const days: { key: string; label: string; entries: BackupEntry[] }[] = []
  for (const entry of entries.slice(0, shown)) {
    const d = entry.time ? new Date(entry.time) : now
    const key = dayKey(d)
    const last = days[days.length - 1]
    if (last?.key === key) last.entries.push(entry)
    else days.push({ key, label: dayLabel(d), entries: [entry] })
  }
  // The header counts the whole day, not only the part shown so far.
  const perDay = new Map<string, number>()
  for (const entry of entries) {
    if (entry.type !== 'point') continue
    const key = dayKey(new Date(entry.time))
    perDay.set(key, (perDay.get(key) ?? 0) + 1)
  }
  // The newest point the schedule or a person took, not a safety copy.
  const latest = entries.find((e) => e.type === 'point' && !e.point.preRestore)
  const latestId = latest?.type === 'point' ? latest.point.id : null

  return (
    <section className="overflow-hidden rounded-lg border border-card-edge/80">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-card-edge/60 bg-muted/30 px-4 py-2.5">
        <h4 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          {t('listTitle')}
          {pointCount > 0 && (
            <span className="rounded-md bg-primary/10 px-1.5 py-px text-[11px] font-semibold tabular-nums text-primary ring-1 ring-inset ring-primary/15">
              {pointCount}
            </span>
          )}
        </h4>
        {!canRestore && pointCount > 0 && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            {t('needsOwner')}
          </span>
        )}
      </header>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <DatabaseBackup className="h-5 w-5" />
          </div>
          <p className="text-sm text-muted-foreground">{t('pointsEmpty')}</p>
        </div>
      ) : (
        <div ref={scrollRef} className="max-h-[30rem] overflow-y-auto overscroll-contain">
          {days.map((day) => {
            const count = perDay.get(day.key) ?? 0
            return (
              <div key={day.key}>
                <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-card-edge/60 bg-card/95 px-4 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                  <span
                    className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                    suppressHydrationWarning
                  >
                    {day.label}
                  </span>
                  {count > 0 && (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {t('dayCount', { count })}
                    </span>
                  )}
                </div>
                <ul className="py-1">
                  {day.entries.map((entry) =>
                    entry.type === 'point' ? (
                      <PointRow
                        key={entry.key}
                        point={entry.point}
                        latest={entry.point.id === latestId}
                        mayRestore={mayRestore}
                        onRestore={onRestore}
                        example={example}
                      />
                    ) : (
                      <RunRow key={entry.key} run={entry.run} snapshots={snapshots} now={now} />
                    )
                  )}
                </ul>
              </div>
            )
          })}
          <ul>
            {hasMore ? (
              <li
                ref={sentinelRef}
                className="flex items-center justify-center gap-2 border-t border-card-edge/60 px-4 py-3 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('loadingMore')}
              </li>
            ) : (
              entries.length > PAGE_SIZE && (
                <li className="border-t border-card-edge/60 px-4 py-3 text-center text-xs text-muted-foreground">
                  {t('endOfList', { count: pointCount })}
                </li>
              )
            )}
          </ul>
        </div>
      )}
    </section>
  )
}

type ChipTone = 'good' | 'safety' | 'bad' | 'active' | 'muted'

const CHIP_TONES: Record<ChipTone, string> = {
  good: 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/25 dark:text-emerald-400',
  safety: 'bg-amber-500/10 text-amber-600 ring-amber-500/25 dark:text-amber-400',
  bad: 'bg-destructive/10 text-destructive ring-destructive/25',
  active: 'bg-primary/10 text-primary ring-primary/25',
  muted: 'bg-muted text-muted-foreground ring-border',
}

/**
 * A row on the day's rail: the line runs through the markers from the first
 * of the day to the last, and every part of the row lines up with the first
 * line of text, so a second line (a hint, an error) hangs below.
 */
const RAIL_ROW = cn(
  'relative flex items-start gap-x-3 px-4 py-2 transition-colors hover:bg-muted/40',
  'before:absolute before:top-0 before:bottom-0 before:left-[29.5px] before:w-px before:bg-border',
  'first:before:top-[22px] last:before:bottom-auto last:before:h-[22px] only:before:hidden'
)

/** The round marker on the rail; the card colour under it hides the line behind. */
function Chip({
  icon: Icon,
  tone,
  spin = false,
}: {
  icon: ComponentType<{ className?: string }>
  tone: ChipTone
  spin?: boolean
}) {
  return (
    <span className="relative z-10 shrink-0 rounded-full bg-card">
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-full ring-1 ring-inset',
          CHIP_TONES[tone]
        )}
      >
        <Icon className={cn('h-3.5 w-3.5', spin && 'animate-spin')} />
      </span>
    </span>
  )
}

function Pill({ tone, children }: { tone: 'primary' | 'safety'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
        tone === 'primary' && 'bg-primary/10 text-primary ring-primary/20',
        tone === 'safety' && 'bg-amber-500/10 text-amber-700 ring-amber-500/25 dark:text-amber-400'
      )}
    >
      {children}
    </span>
  )
}

/** A restore point: its time, what took it, its size, and the way back to it. */
function PointRow({
  point,
  latest,
  mayRestore,
  onRestore,
  example = false,
}: {
  point: PlatformSnapshotView
  latest: boolean
  mayRestore: boolean
  onRestore: (point: PlatformSnapshotView) => void
  /** A made-up point: Explore has no page to open, so it is a plain button. */
  example?: boolean
}) {
  const t = useTranslations('settings.data.platformBackups')
  const format = useFormatter()
  const size = point.bytes == null ? null : formatBytes(point.bytes)
  const kind = point.preRestore
    ? t('kind.safety')
    : point.trigger === 'manual'
      ? t('kind.manual')
      : t('kind.scheduled')

  return (
    <li className={cn(RAIL_ROW, 'flex-wrap gap-y-2 sm:flex-nowrap')}>
      <Chip
        icon={point.preRestore ? ShieldCheck : CheckCircle2}
        tone={point.preRestore ? 'safety' : 'good'}
      />
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-sm font-medium tabular-nums">
            {format.dateTime(new Date(point.time), { timeStyle: 'short' })}
          </span>
          {point.preRestore ? (
            <Pill tone="safety">{kind}</Pill>
          ) : (
            <span className="text-xs text-muted-foreground">{kind}</span>
          )}
          {latest && <Pill tone="primary">{t('latest')}</Pill>}
          {size && (
            <span className="text-xs tabular-nums text-muted-foreground sm:hidden">· {size}</span>
          )}
        </div>
        {point.preRestore && (
          <p className="mt-0.5 text-xs text-muted-foreground">{t('kind.safetyHint')}</p>
        )}
      </div>
      {size && (
        <span className="hidden w-20 shrink-0 pt-1.5 text-right text-xs tabular-nums text-muted-foreground sm:block">
          {size}
        </span>
      )}
      <div className="flex w-full shrink-0 gap-1.5 pl-10 sm:w-auto sm:pl-0">
        {/* Open to look inside; the page refuses anyone but an admin. */}
        {example ? (
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" tabIndex={-1}>
            {t('explore')}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="h-7 px-2.5 text-xs" asChild>
            <Link href={`/settings/data/restore-points/${point.id}?source=platform`}>
              {t('explore')}
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs text-destructive hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
          onClick={() => onRestore(point)}
          disabled={!mayRestore}
        >
          <RotateCcw className="h-3 w-3" />
          {t('restore.action')}
        </Button>
      </div>
    </li>
  )
}

/**
 * A run that left no restore point of its own: one queued or running, a
 * backup that failed or was skipped, a backup the stored points do not list
 * yet, or a restore, with the point it went back to and the reason support
 * gave for it.
 */
function RunRow({
  run,
  snapshots,
  now,
}: {
  run: BackupRunView
  snapshots: PlatformSnapshotView[]
  now: Date
}) {
  const t = useTranslations('settings.data.platformBackups')
  const format = useFormatter()
  const isRestore = run.trigger === 'restore'
  const at = run.startedAt ?? run.finishedAt

  // What a restore went back to, by its time when the point is still kept.
  const restoredTo = (() => {
    if (!isRestore || !run.snapshotId) return ''
    const point = snapshots.find((s) => s.id === run.snapshotId)
    return point
      ? format.dateTime(new Date(point.time), { dateStyle: 'medium', timeStyle: 'short' })
      : run.snapshotId.slice(0, 8)
  })()

  const elapsed = (() => {
    if (run.status !== 'running' || !run.startedAt) return null
    const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(run.startedAt)) / 1000))
    const unit = (value: number, u: 'hour' | 'minute' | 'second') =>
      format.number(value, { style: 'unit', unit: u, unitDisplay: 'narrow' })
    if (seconds < 60) return unit(seconds, 'second')
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return unit(minutes, 'minute')
    return `${unit(Math.floor(minutes / 60), 'hour')} ${unit(minutes % 60, 'minute')}`
  })()

  const look: { icon: ComponentType<{ className?: string }>; tone: ChipTone; spin?: boolean } =
    run.status === 'running'
      ? { icon: Loader2, tone: 'active', spin: true }
      : run.status === 'queued'
        ? { icon: Clock, tone: 'active' }
        : run.status === 'failed'
          ? { icon: XCircle, tone: 'bad' }
          : run.status === 'skipped'
            ? { icon: MinusCircle, tone: 'muted' }
            : isRestore
              ? { icon: History, tone: 'active' }
              : { icon: CheckCircle2, tone: 'good' }

  const title = isRestore
    ? t(`runTitle.restore.${run.status}`, { time: restoredTo })
    : t(`runTitle.backup.${run.status}`)

  return (
    <li className={RAIL_ROW}>
      <Chip icon={look.icon} tone={look.tone} spin={look.spin} />
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {at && (
            <span className="text-sm font-medium tabular-nums">
              {format.dateTime(new Date(at), { timeStyle: 'short' })}
            </span>
          )}
          <span
            className={cn(
              'text-sm',
              run.status === 'failed' ? 'font-medium text-destructive' : 'text-foreground'
            )}
          >
            {title}
          </span>
          {!isRestore && (
            <span className="text-xs text-muted-foreground">
              {run.trigger === 'manual' ? t('kind.manual') : t('kind.scheduled')}
            </span>
          )}
          {elapsed && (
            <span className="text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>
              · {elapsed}
            </span>
          )}
        </div>
        {isRestore && run.reason && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('supportReason', { reason: run.reason })}
          </p>
        )}
        {run.error && <p className="mt-0.5 break-words text-xs text-destructive/90">{run.error}</p>}
      </div>
    </li>
  )
}
