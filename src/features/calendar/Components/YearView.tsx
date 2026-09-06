'use client'

import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import { useDateSettings } from '@/components/date-settings-context'
import { cn } from '@/lib/utils'
import { getMonthGridDays, isWeekend, toLocalDateStr } from '../Lib/calendar-range'
import type { CalendarEvent } from '../Actions/calendarActions'

interface YearViewProps {
  year: number
  eventsByDate: Map<string, CalendarEvent[]>
  todayStr: string
  selectedDateStr: string
  onSelectDate: (date: Date) => void
  onOpenDay: (date: Date) => void
}

/**
 * Twelve small months at once. Each day carries a heat mark for how much is
 * on it, so a glance shows the busy weeks of the year; a click selects the
 * day and a double click opens it.
 */
export function YearView({
  year,
  eventsByDate,
  todayStr,
  selectedDateStr,
  onSelectDate,
  onOpenDay,
}: YearViewProps) {
  const t = useTranslations('calendar')
  const format = useDayFormatter()
  const { weekStartDay } = useDateSettings()
  const weekdayInitials = Array.from({ length: 7 }, (_, i) => {
    // Any week will do for the initials; the 4th of Jan 2026 is a Sunday.
    const d = new Date(2026, 0, 4 + ((weekStartDay + i) % 7))
    return format.dateTime(d, { weekday: 'narrow' })
  })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, month) => {
          const days = getMonthGridDays(year, month, weekStartDay)
          return (
            <section key={month} className="min-w-0">
              <button
                type="button"
                onClick={() => onSelectDate(new Date(year, month, 1))}
                className="mb-2 rounded px-1 text-sm font-semibold hover:bg-accent"
              >
                {format.dateTime(new Date(year, month, 1), { month: 'long' })}
              </button>
              <div className="grid grid-cols-7 gap-y-0.5 text-center">
                {weekdayInitials.map((label, i) => (
                  <span
                    key={`${label}-${i}`}
                    className="text-[10px] font-medium uppercase text-muted-foreground"
                  >
                    {label}
                  </span>
                ))}
                {days.map((date) => {
                  const dateStr = toLocalDateStr(date)
                  const inMonth = date.getMonth() === month
                  const count = inMonth ? (eventsByDate.get(dateStr)?.length ?? 0) : 0
                  const isToday = dateStr === todayStr
                  const isSelected = dateStr === selectedDateStr
                  if (!inMonth) return <span key={dateStr} className="h-8" />
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => onSelectDate(date)}
                      onDoubleClick={() => onOpenDay(date)}
                      title={count > 0 ? t('dayTotal', { count }) : undefined}
                      className={cn(
                        'group relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-full text-xs tabular-nums transition-colors',
                        isToday
                          ? 'bg-primary font-bold text-primary-foreground'
                          : isSelected
                            ? 'bg-primary/15 font-semibold text-foreground'
                            : cn('hover:bg-accent', isWeekend(date) && 'text-muted-foreground')
                      )}
                    >
                      <span className="leading-none">{date.getDate()}</span>
                      {count > 0 && (
                        <span
                          className={cn(
                            'absolute bottom-1 h-1 rounded-full',
                            isToday ? 'bg-primary-foreground/80' : 'bg-primary',
                            count >= 5 ? 'w-4' : count >= 3 ? 'w-3' : 'w-1.5'
                          )}
                        />
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
