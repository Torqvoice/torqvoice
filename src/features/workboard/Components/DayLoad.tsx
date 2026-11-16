'use client'

import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { type DayLoad, dayLoad } from '../utils/layout'
import { formatDuration } from './DurationSlider'

/** Red past full, amber from three quarters, green below: the one scale every bar uses. */
function barColour(load: DayLoad): string {
  return load.overMinutes > 0 ? 'bg-red-500' : load.pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'
}

/**
 * How full a day is, as a bar. It stops at full width however far over the
 * day is: the amount over is said in words beside it, not drawn.
 */
export function DayLoadBar({ load, className }: { load: DayLoad; className?: string }) {
  return (
    <span className={cn('block w-full overflow-hidden rounded-full bg-muted', className)}>
      <span
        className={cn('block h-full rounded-full', barColour(load))}
        style={{ width: `${Math.min(load.pct, 100)}%` }}
      />
    </span>
  )
}

/**
 * The day's load as one statement for a screen reader: booked, capacity and,
 * past capacity, how much over. What is drawn beside it is hidden from one,
 * so the figure is heard once and whole.
 */
export function DayLoadSpoken({ load }: { load: DayLoad }) {
  const t = useTranslations('workBoard.board.load')
  if (load.capacityMinutes <= 0) return null
  const booked = formatDuration(load.bookedMinutes)
  const capacity = formatDuration(load.capacityMinutes)
  return (
    <span className="sr-only">
      {load.overMinutes > 0
        ? t('spokenOver', { booked, capacity, amount: formatDuration(load.overMinutes) })
        : t('spoken', { booked, capacity })}
    </span>
  )
}

/**
 * The line under a day: "6h / 8h", and past capacity "11h / 8h · 3h over".
 *
 * Red text is the 700 shade on a light theme and the 400 on a dark one, as
 * src/lib/status-colors.ts has it: the 500 the line used to carry is under
 * 4.5:1 on a light card at this size.
 *
 * The two halves each stay on one line and the pair wraps between them, so a
 * narrow column on a wall screen in a long language breaks the line in two
 * and never cuts a figure off.
 */
export function DayLoadFigure({
  bookedMinutes,
  capacityMinutes,
}: {
  bookedMinutes: number
  capacityMinutes: number
}) {
  const t = useTranslations('workBoard.board.load')
  const load = dayLoad(bookedMinutes, capacityMinutes)
  const over = load.overMinutes > 0

  return (
    <div className="mt-auto space-y-0.5 pt-1">
      <DayLoadBar load={load} className="h-1" />
      <p
        className={cn(
          'flex flex-wrap justify-center gap-x-1 text-center text-[10px] font-medium tabular-nums',
          over ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'
        )}
      >
        <span className="whitespace-nowrap" aria-hidden={capacityMinutes > 0}>
          {formatDuration(bookedMinutes)}
          {capacityMinutes > 0 ? ` / ${formatDuration(capacityMinutes)}` : ''}
        </span>
        {over && (
          <span className="whitespace-nowrap font-semibold" aria-hidden>
            {`· ${t('over', { amount: formatDuration(load.overMinutes) })}`}
          </span>
        )}
        <DayLoadSpoken load={load} />
      </p>
    </div>
  )
}
