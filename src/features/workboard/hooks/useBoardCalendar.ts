'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { getWorkshopCalendar } from '@/features/workshop-calendar/Actions/calendarActions'
import type { WorkshopCalendar } from '@/features/workshop-calendar/Lib/calendar'
import { type MinuteSpan, awayDay, closedDay } from '@/features/workshop-calendar/Lib/boardDays'

/** A day on the board that is closed for some or all of it. */
export interface BoardClosed {
  /** Every closed part of the day, its usual closed hours included. */
  spans: MinuteSpan[]
  /** The parts a holiday or closure takes. */
  closureSpans: MinuteSpan[]
  names: string[]
  allDay: boolean
  closedWeekday: boolean
  /** What the day header says, or null when nothing out of the ordinary. */
  label: string | null
}

/** A technician away for some or all of a day. */
export interface BoardAway {
  spans: MinuteSpan[]
  allDay: boolean
  /** The reason (or reasons) in words. */
  label: string
}

export type ClosedByDay = Record<string, BoardClosed>
export type AwayByLaneDay = Record<string, BoardAway>

export const awayKey = (laneId: string, date: string) => `${laneId}|${date}`

/**
 * The workshop calendar for the days the board shows: what is closed each
 * day and, on a board grouped by technician, who is away. Read again when the
 * week changes and after time off is edited.
 */
export function useBoardCalendar({
  days,
  technicianLaneIds,
}: {
  /** The week's days, "YYYY-MM-DD". */
  days: string[]
  /** Lanes that are technicians, when the board is grouped by technician. */
  technicianLaneIds: string[]
}) {
  const t = useTranslations('workshopCalendar')
  const [calendar, setCalendar] = useState<WorkshopCalendar | null>(null)
  const [enabled, setEnabled] = useState(false)
  const first = days[0]
  const last = days[days.length - 1]

  const load = useCallback(async () => {
    if (!first || !last) return
    const res = await getWorkshopCalendar({ from: first, to: last })
    if (res.success && res.data) {
      setCalendar(res.data.calendar)
      setEnabled(res.data.enabled)
    }
  }, [first, last])

  useEffect(() => {
    load()
  }, [load])

  const closedByDay = useMemo<ClosedByDay | undefined>(() => {
    if (!calendar) return undefined
    const out: ClosedByDay = {}
    for (const day of days) {
      const c = closedDay(calendar, day)
      out[day] = {
        ...c,
        label:
          c.names.length > 0
            ? c.allDay
              ? t('board.closedFor', { name: c.names.join(', ') })
              : t('board.shortDay', { name: c.names.join(', ') })
            : c.closedWeekday
              ? t('board.closedDay')
              : null,
      }
    }
    return out
  }, [calendar, days, t])

  const laneKey = technicianLaneIds.join(',')
  const awayByLaneDay = useMemo<AwayByLaneDay | undefined>(() => {
    if (!calendar || technicianLaneIds.length === 0) return undefined
    const out: AwayByLaneDay = {}
    const reason = (r: string) => (t.has(`reasons.${r}`) ? t(`reasons.${r}`) : r)
    for (const laneId of technicianLaneIds) {
      for (const day of days) {
        const away = awayDay(calendar, laneId, day)
        if (!away) continue
        out[awayKey(laneId, day)] = {
          spans: away.spans,
          allDay: away.allDay,
          label: [...new Set(away.absences.map((a) => reason(a.reason)))].join(', '),
        }
      }
    }
    return out
    // laneKey stands in for the array, which is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendar, days, laneKey, t])

  return { calendar, enabled, closedByDay, awayByLaneDay, reload: load }
}
