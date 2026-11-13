'use client'

import Link from 'next/link'
import { useMemo } from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useDateSettings } from '@/components/date-settings-context'
import { awayEdges } from '@/features/workshop-calendar/Lib/format'
import type { VehicleJobWarning } from '@/features/vehicles/Lib/vehicleJobWarnings'
import { cn } from '@/lib/utils'

/**
 * The words for a job's booking problems. The details are the work order's
 * own sentences (service.schedule and workshopCalendar.schedule), so what
 * the vehicle page says is wrong is what the job shows once it is opened.
 * Times are on the workshop's clock, as the work order shows them.
 */
export function useJobWarningText() {
  const t = useTranslations('vehicles.detail.jobWarning')
  const tCal = useTranslations('workshopCalendar')
  const tSchedule = useTranslations('service.schedule')
  const format = useFormatter()
  const { timezone } = useDateSettings()

  return useMemo(() => {
    const timeZone = timezone || undefined
    const day = (at: Date) => format.dateTime(at, { day: 'numeric', month: 'short', timeZone })
    const dayAndClock = (at: Date) =>
      format.dateTime(at, {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone,
      })
    const clock = (at: Date) =>
      format.dateTime(at, { hour: '2-digit', minute: '2-digit', timeZone })
    const reason = (stored: string) =>
      tCal.has(`reasons.${stored}`) ? tCal(`reasons.${stored}`) : stored

    /** Each kind of problem as a few words, the most pressing first. */
    const labels = (w: VehicleJobWarning): string[] => {
      const out: string[] = []
      if (w.away.length > 0) {
        const people = [...new Set(w.away.flatMap((a) => a.people))]
        out.push(
          people.length > 0
            ? t('away', { count: people.length, names: people.join(', ') })
            : tCal('schedule.awayHeading')
        )
      }
      if (w.clashes.length > 0) out.push(t('clash'))
      if (w.closures.length > 0 || w.closedWeekday) out.push(t('closed'))
      return out
    }

    /** One sentence per problem, as the work order words it. */
    const lines = (w: VehicleJobWarning): string[] => {
      const out: string[] = []
      for (const a of w.away) {
        const edges = awayEdges(a.start, a.end, timeZone)
        const from = edges.startClock ? dayAndClock(edges.start) : day(edges.start)
        const to = edges.endClock ? dayAndClock(edges.end) : day(edges.end)
        const who = a.people.length > 0 ? `${a.people.join(', ')}: ` : ''
        out.push(
          `${who}${tCal('schedule.awayConflict', { reason: reason(a.reason) })} · ${from === to ? from : `${from} – ${to}`}`
        )
      }
      for (const c of w.clashes) {
        const held =
          c.onTechnician && c.onBay
            ? tSchedule('clashBoth')
            : c.onTechnician
              ? c.people.length > 0
                ? tSchedule('clashPeople', { count: c.people.length, names: c.people.join(', ') })
                : tSchedule('clashTechnician')
              : tSchedule('clashBay')
        out.push(
          `${c.label || tSchedule('anotherJob')} · ${dayAndClock(new Date(c.start))} – ${clock(new Date(c.end))} · ${held}`
        )
      }
      if (w.closures.length > 0) out.push(tCal('schedule.closed', { names: w.closures.join(', ') }))
      else if (w.closedWeekday) out.push(tCal('schedule.closedWeekday'))
      return out
    }

    return { labels, lines, day, heading: t('heading'), fix: t('fix') }
  }, [t, tCal, tSchedule, format, timezone])
}

/**
 * A job's booking problem, in the line that names the job: the first problem
 * in a few amber words, and every detail on hover. Given an `href` it is a
 * link to the job, for rows where the rest of the line is one already; inside
 * a link it is plain text, the surrounding link doing the opening.
 */
export function JobWarningChip({
  warning,
  href,
  className,
}: {
  warning: VehicleJobWarning
  href?: string
  className?: string
}) {
  const text = useJobWarningText()
  const labels = text.labels(warning)
  const chip = cn(
    'inline-flex min-w-0 max-w-full items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-px text-[11.5px] font-semibold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
    href && 'relative z-10 transition-colors hover:bg-amber-100 dark:hover:bg-amber-950/70',
    className
  )
  const body = (
    <>
      <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />
      <span className="truncate">{labels[0]}</span>
      {labels.length > 1 && <span className="shrink-0 opacity-75">+{labels.length - 1}</span>}
    </>
  )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <Link href={href} className={chip} data-testid="job-warning">
            {body}
          </Link>
        ) : (
          <span className={chip} data-testid="job-warning">
            {body}
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" align="start" className="max-w-xs space-y-1 py-2">
        <p className="font-semibold">{text.heading}</p>
        <ul className="space-y-0.5">
          {text.lines(warning).map((line) => (
            <li key={line} className="leading-snug opacity-90">
              {line}
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The same problems spelled out, for the job the car is in for now: what is
 * wrong, in the work order's own words, and the way into the job to fix it.
 */
export function JobWarningCallout({ warning, href }: { warning: VehicleJobWarning; href: string }) {
  const text = useJobWarningText()
  return (
    <div
      role="alert"
      data-testid="job-warning-callout"
      className="flex flex-wrap items-start gap-x-2.5 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 dark:border-amber-900/60 dark:bg-amber-950/40"
    >
      <AlertTriangle
        aria-hidden
        className="mt-px h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500"
      />
      <div className="min-w-0 flex-1 basis-48 space-y-1">
        <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">
          {text.heading}
        </p>
        <ul className="space-y-0.5">
          {text.lines(warning).map((line) => (
            <li key={line} className="text-xs leading-snug text-amber-800 dark:text-amber-300">
              {line}
            </li>
          ))}
        </ul>
      </div>
      <Link
        href={href}
        className="ml-auto inline-flex shrink-0 items-center self-center rounded-md px-1.5 py-1 text-xs font-semibold text-amber-900 underline-offset-2 hover:underline dark:text-amber-200"
      >
        {text.fix}
        <ChevronRight aria-hidden className="ml-0.5 h-3.5 w-3.5" />
      </Link>
    </div>
  )
}
