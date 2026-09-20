'use client'

import { CalendarClock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { isPromiseOverdue } from '@/features/vehicles/Lib/promise'
import type { WorkBoardJob } from '../Actions/boardActions'

/**
 * A job whose promise to the customer has passed, on the board.
 *
 * The board is where the day is read, so a broken promise has to be visible
 * without opening the job. Only a late one is marked: a promise still ahead
 * is the normal state of every job on the board and would mark them all.
 *
 * Amber, like the same warning on the work order's own header, and not the
 * destructive red the app keeps for an overdue inspection or reminder.
 *
 * Rendered from `Date.now()`, so the server's answer and the browser's can
 * differ by the minute the page was built in: `suppressHydrationWarning`
 * keeps that from being reported as a mismatch, and the browser's answer is
 * the one that stays.
 */
export function PromiseOverdueMark({
  job,
  className,
  compact = false,
}: {
  job: Pick<WorkBoardJob, 'promisedAt' | 'status'>
  className?: string
  /** Icon only, for a block with no room for words. */
  compact?: boolean
}) {
  const t = useTranslations('workBoard.job')
  if (!isPromiseOverdue(job.promisedAt, job.status)) return null

  return (
    <span
      data-testid="promise-overdue"
      suppressHydrationWarning
      title={t('promiseOverdue')}
      className={cn(
        'inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium',
        'bg-amber-500/15 text-amber-700 dark:text-amber-300',
        className
      )}
    >
      <CalendarClock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className={cn(compact && 'sr-only')}>{t('promiseLate')}</span>
    </span>
  )
}
