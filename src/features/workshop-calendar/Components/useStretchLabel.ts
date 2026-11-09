'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatDays } from '../Lib/format'

export interface StretchLike {
  startDate: string
  endDate: string
  startTime?: string | null
  endTime?: string | null
}

/**
 * Reads a closure or an absence back the way it was entered: "24 Dec 2026",
 * "24 Dec 2026, from 12:00", "3 - 7 Mar 2027".
 */
export function useStretchLabel(opts: { year?: boolean; weekday?: boolean } = {}) {
  const t = useTranslations('workshopCalendar.range')
  const locale = useLocale()
  return (s: StretchLike) => {
    const dates = formatDays(s.startDate, s.endDate, locale, opts)
    const start = s.startTime || null
    const end = s.endTime || null
    if (!start && !end) return t('allDay', { dates })
    if (start && !end) return t('from', { dates, time: start })
    if (!start && end) return t('until', { dates, time: end })
    return s.startDate === s.endDate
      ? t('between', { dates, start: start as string, end: end as string })
      : t('fromUntil', { dates, start: start as string, end: end as string })
  }
}
