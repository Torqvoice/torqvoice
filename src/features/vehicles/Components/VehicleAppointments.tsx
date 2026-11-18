'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { CalendarClock } from 'lucide-react'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import { appointmentHref } from '@/features/calendar/Lib/appointmentLink'

export type VehicleAppointment = {
  id: string
  title: string
  startAt: Date | string
  /** YYYY-MM-DD on the workshop's clock. */
  date: string
  /** HH:MM on the workshop's clock. */
  time: string
  upcoming: boolean
}

/**
 * The vehicle's appointments in the call sheet's rail: what is coming, then
 * the last few, each opening the calendar on that appointment. Left out when
 * the car has none, like the rest of the rail's optional sections.
 */
export function VehicleAppointments({ appointments }: { appointments: VehicleAppointment[] }) {
  const t = useTranslations('vehicles.detail')
  const { formatDate, formatTime } = useFormatDate()

  if (appointments.length === 0) return null

  const upcoming = appointments.filter((a) => a.upcoming)
  const past = appointments.filter((a) => !a.upcoming)

  // The workshop's own date format and clock, like the rest of the rail.
  const when = (a: VehicleAppointment) => `${formatDate(a.startAt)} · ${formatTime(a.startAt)}`

  const row = (a: VehicleAppointment) => (
    <li key={a.id}>
      <Link
        href={appointmentHref(a.id)}
        className="flex w-full items-start gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-muted/50"
      >
        <CalendarClock
          aria-hidden
          className={cn(
            'mt-[3px] h-3.5 w-3.5 shrink-0',
            a.upcoming ? 'text-pink-700 dark:text-pink-400' : 'text-muted-foreground'
          )}
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block truncate text-[13px] font-medium leading-snug',
              !a.upcoming && 'text-muted-foreground'
            )}
          >
            {a.title}
          </span>
          <span className="block text-xs tabular-nums text-muted-foreground">{when(a)}</span>
        </span>
      </Link>
    </li>
  )

  return (
    <section aria-labelledby="vehicle-appointments">
      <h2 id="vehicle-appointments" className="px-1.5 pb-1 text-[13px] font-semibold">
        {t('appointments')}
      </h2>
      {upcoming.length === 0 && (
        <p className="px-1.5 pb-1 text-[13px] text-muted-foreground">
          {t('noUpcomingAppointments')}
        </p>
      )}
      {upcoming.length > 0 && <ul className="space-y-0.5">{upcoming.map(row)}</ul>}
      {past.length > 0 && (
        <>
          <p className="px-1.5 pt-2 pb-0.5 text-xs text-muted-foreground">
            {t('earlierAppointments')}
          </p>
          <ul className="space-y-0.5">{past.map(row)}</ul>
        </>
      )}
    </section>
  )
}
