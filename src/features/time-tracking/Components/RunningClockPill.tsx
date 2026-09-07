'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Loader2, Square } from 'lucide-react'
import { useTimeClock } from './TimeClockProvider'
import { useTick } from '../hooks/useTick'
import { formatElapsed } from '../Lib/timesheet'
import { cn } from '@/lib/utils'

/**
 * The running clock, in the header of every page.
 *
 * The phone keeps a bar above its tab strip for the same reason: a clock
 * that is only visible on the job's own page gets forgotten the moment
 * somebody navigates away, and a forgotten clock is the one error the whole
 * feature exists to prevent. Nothing renders while nothing runs.
 */
export function RunningClockPill() {
  const t = useTranslations('timeTracking.clock')
  const { open, busy, stop } = useTimeClock()
  const now = useTick(open !== null)
  if (!open) return null

  const href = open.vehicleId
    ? `/vehicles/${open.vehicleId}/service/${open.serviceRecordId}`
    : `/sales/${open.serviceRecordId}`
  const elapsed = formatElapsed(now.getTime() - new Date(open.startedAt).getTime())

  return (
    <div
      className={cn(
        'flex h-8 items-center overflow-hidden rounded-md border border-primary/40 bg-primary/10 text-sm',
        'shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]'
      )}
      role="status"
      aria-live="off"
    >
      <Link
        href={href}
        className="flex h-full min-w-0 items-center gap-2 pl-2.5 pr-2 hover:bg-primary/10"
        title={t('runningOn', { job: open.jobTitle })}
      >
        <span className="relative flex size-2 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-primary" />
        </span>
        <span className="font-mono text-[13px] font-semibold tabular-nums text-primary">
          {elapsed}
        </span>
        <span className="hidden max-w-40 truncate text-xs text-muted-foreground lg:inline">
          {open.jobTitle}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => void stop()}
        disabled={busy}
        aria-label={t('stop')}
        title={t('stop')}
        className="flex h-full cursor-pointer items-center border-l border-primary/30 px-2 text-primary transition-colors hover:bg-primary/15 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Square className="size-3 fill-current" />
        )}
      </button>
    </div>
  )
}
