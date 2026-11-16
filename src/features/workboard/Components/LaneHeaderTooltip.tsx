'use client'

import { useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { WorkBoardJob } from '../Actions/boardActions'
import { type AwayByLaneDay, type ClosedByDay, laneDayHours } from '../hooks/useBoardCalendar'
import { jobOverlapsDate } from '../utils/datetime'
import { bookedMinutesOnDay, dayLoad } from '../utils/layout'
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
  awayLabel,
  closedByDay,
  awayByLaneDay,
  children,
}: {
  lane: BoardLane
  /** Jobs in this lane, across the days the tooltip is summarising. */
  jobs: WorkBoardJob[]
  days: string[]
  capacityMinutes: number
  /** "Tuesday" or "This week", depending on what the header covers. */
  periodLabel: string
  /** Why the technician is away, when they are. */
  awayLabel?: string
  /** The workshop calendar for the days, so the total matches the day figures. */
  closedByDay?: ClosedByDay
  awayByLaneDay?: AwayByLaneDay
  children: React.ReactNode
}) {
  const t = useTranslations('workBoard.lane')
  const tc = useTranslations('workshopCalendar')

  const booked = days.reduce(
    (sum, day) =>
      sum + bookedMinutesOnDay(jobs, day, laneDayHours(lane, day, closedByDay, awayByLaneDay)),
    0
  )
  // Every job on the days, one that adds no hours on a closed day included.
  const jobCount = jobs.filter((job) => days.some((day) => jobOverlapsDate(job, day))).length
  const load = dayLoad(booked, capacityMinutes)
  const pct = capacityMinutes > 0 ? Math.round(load.pct) : null

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
                label={load.overMinutes > 0 ? t('over') : t('free')}
                value={formatDuration(
                  load.overMinutes > 0 ? load.overMinutes : capacityMinutes - booked
                )}
              />
            </>
          )}
          <Row label={t('jobs')} value={String(jobCount)} />
        </dl>
        {pct !== null && (
          <p className="mt-1 tabular-nums text-background/70">{t('utilisation', { pct })}</p>
        )}
        {awayLabel && (
          <p className="mt-1 font-medium">{tc('board.awayTooltip', { reason: awayLabel })}</p>
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
