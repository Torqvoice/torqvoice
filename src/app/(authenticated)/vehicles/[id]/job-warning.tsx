'use client'

import { useMemo } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { useDateSettings } from '@/components/date-settings-context'
import { awayEdges } from '@/features/workshop-calendar/Lib/format'
import type { VehicleJobWarning } from '@/features/vehicles/Lib/vehicleJobWarnings'

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

    return { lines, heading: t('heading') }
  }, [t, tCal, tSchedule, format, timezone])
}

/**
 * A job's booking problems on the job's own row, in the work order's own
 * words: every problem on one amber line, cut short where the row runs out
 * and whole on hover. The row around it is the way into the job to fix it.
 */
export function JobWarningLine({ warning }: { warning: VehicleJobWarning }) {
  const text = useJobWarningText()
  const said = text.lines(warning).join(' · ')
  return (
    <span
      data-testid="job-warning"
      title={`${text.heading}: ${said}`}
      className="flex min-w-0 items-start gap-1.5 font-medium text-amber-700 @2xl:items-center dark:text-amber-400"
    >
      <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 @2xl:mt-0" />
      <span className="sr-only">{text.heading}: </span>
      {/* In full where the row is stacked and has the room; one line, cut
          short, where it shares the row with the table's other columns. */}
      <span className="min-w-0 whitespace-normal @2xl:truncate">{said}</span>
    </span>
  )
}
