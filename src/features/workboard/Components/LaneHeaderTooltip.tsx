'use client'

import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkBoardJob } from '../Actions/boardActions'
import { bookedMinutesOnDay } from '../utils/layout'
import type { BoardLane } from '../utils/lanes'
import { formatDuration } from './DurationSlider'

/**
 * What a lane header is worth saying when there is room to say it.
 *
 * The header itself is a colour dot and a name truncated to whatever the column
 * width allows, which at fifteen lanes is a few characters. The hover is where
 * the name is readable at all, so it carries the load: who, how full, how much
 * is left, and how many jobs make up the number.
 */
export function LaneHeaderTooltip({
  lane,
  jobs,
  days,
  capacityMinutes,
  periodLabel,
  children,
}: {
  lane: BoardLane
  /** Jobs in this lane, across the days the tooltip is summarising. */
  jobs: WorkBoardJob[]
  days: string[]
  capacityMinutes: number
  /** "Tuesday" or "This week", depending on what the header covers. */
  periodLabel: string
  children: React.ReactNode
}) {
  const t = useTranslations('workBoard.lane')

  const booked = days.reduce((sum, day) => sum + bookedMinutesOnDay(jobs, day), 0)
  const jobCount = jobs.filter((job) => days.some((day) => touchesDay(job, day))).length
  const pct = capacityMinutes > 0 ? Math.round((booked / capacityMinutes) * 100) : null
  const free = capacityMinutes - booked

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[240px]">
        <p className="flex items-center gap-1.5 font-medium">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: lane.color }} />
          {lane.name}
        </p>
        <p className="mt-1 text-background/70">{periodLabel}</p>
        <dl className="mt-1 space-y-0.5">
          <Row label={t('booked')} value={formatDuration(booked)} />
          {capacityMinutes > 0 && (
            <>
              <Row label={t('capacity')} value={formatDuration(capacityMinutes)} />
              <Row
                label={free >= 0 ? t('free') : t('over')}
                value={formatDuration(Math.abs(free))}
              />
            </>
          )}
          <Row label={t('jobs')} value={String(jobCount)} />
        </dl>
        {pct !== null && (
          <p className="mt-1 tabular-nums text-background/70">{t('utilisation', { pct })}</p>
        )}
        {lane.isPlaceholder && <p className="mt-1 text-background/70">{t('placeholder')}</p>}
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
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-background/70">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  )
}

function touchesDay(job: WorkBoardJob, day: string): boolean {
  return bookedMinutesOnDay([job], day) > 0
}
