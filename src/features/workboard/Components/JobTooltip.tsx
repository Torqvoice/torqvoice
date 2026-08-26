'use client'

import { CalendarClock, ClipboardCheck, User, Wrench } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkBoardJob } from '../Actions/boardActions'
import { type ClockFormat, formatClockRange } from '../utils/clock'
import { getDurationMinutes, getJobDateRange } from '../utils/datetime'
import { normalizeStatus } from '../utils/job-colors'
import { formatDuration } from './DurationSlider'

/** Status strings as the translation file spells them. */
const STATUS_KEY: Record<string, string> = {
  pending: 'pending',
  scheduled: 'pending',
  'in-progress': 'inProgress',
  'waiting-parts': 'waitingParts',
  completed: 'completed',
}

/**
 * Everything about a job that will not fit on its block.
 *
 * A block on a busy week is a coloured sliver with a truncated title, and the
 * browser's own `title` attribute was showing little more than that. What
 * someone hovering actually wants to know is whose car it is, who has it, and
 * how long it runs, so that is what this says.
 */
export function JobTooltip({
  job,
  timeFormat,
  ownerName,
  ownerColor,
  bayName,
  children,
}: {
  job: WorkBoardJob
  timeFormat: ClockFormat
  /** Technician on the job, when one is assigned. */
  ownerName?: string | null
  ownerColor?: string | null
  bayName?: string | null
  children: React.ReactNode
}) {
  const t = useTranslations('workBoard.job')
  const tStatus = useTranslations('workBoard.presenter.statusLabels')

  const { start, end } = getJobDateRange(job)
  const minutes = start && end ? getDurationMinutes(start, end) : null
  const statusKey = STATUS_KEY[normalizeStatus(job.status)]

  const vehicle = job.vehicle
    ? [`${job.vehicle.year} ${job.vehicle.make} ${job.vehicle.model}`, job.vehicle.licensePlate]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" align="start" className="max-w-[260px]">
        <p className="flex items-start gap-1.5 font-medium">
          {job.type === 'serviceRecord' ? (
            <Wrench className="mt-px h-3.5 w-3.5 shrink-0" />
          ) : (
            <ClipboardCheck className="mt-px h-3.5 w-3.5 shrink-0" />
          )}
          <span>{job.title}</span>
        </p>

        {vehicle && <p className="mt-1">{vehicle}</p>}
        {job.customerName && (
          <p className="flex items-center gap-1.5 text-background/70">
            <User className="h-3 w-3 shrink-0" />
            {job.customerName}
          </p>
        )}

        <dl className="mt-2 space-y-0.5">
          {start && end ? (
            <>
              <Row
                label={t('time')}
                value={formatClockRange(
                  start.getHours() * 60 + start.getMinutes(),
                  end.getHours() * 60 + end.getMinutes(),
                  timeFormat
                )}
              />
              {minutes !== null && <Row label={t('duration')} value={formatDuration(minutes)} />}
            </>
          ) : (
            <p className="flex items-center gap-1.5 text-background/70">
              <CalendarClock className="h-3 w-3 shrink-0" />
              {t('noTime')}
            </p>
          )}

          <Row
            label={t('technician')}
            value={ownerName ?? t('none')}
            colour={ownerName ? ownerColor : null}
          />
          {bayName && <Row label={t('workBay')} value={bayName} />}
          {statusKey && <Row label={t('status')} value={tStatus(statusKey)} />}
        </dl>
      </TooltipContent>
    </Tooltip>
  )
}

/*
 * Muted text inside a tooltip has to be muted against the tooltip, not against
 * the page. The tooltip is `bg-foreground text-background`, so it inverts with
 * the theme, and `text-muted-foreground` is a mid grey that lands at poor
 * contrast on both the near-black light-theme tooltip and the near-white dark
 * one. Fading the tooltip's own text colour tracks the inversion.
 */
function Row({ label, value, colour }: { label: string; value: string; colour?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-background/70">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right">
        {colour && (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: colour }} />
        )}
        {value}
      </dd>
    </div>
  )
}
