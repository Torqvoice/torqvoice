'use client'

import { useMemo } from 'react'
import { useDayFormatter } from './useDayFormatter'
import { cn } from '@/lib/utils'
import { isoWeekNumber, isWeekend, toLocalDateStr } from '../Lib/calendar-range'
import { CalendarDayCell } from './CalendarDayCell'
import type { DayActions } from './DayContextMenu'
import type { CalendarEvent } from '../Actions/calendarActions'

interface MonthViewProps {
  /** Every day of the grid, already padded to whole weeks. */
  days: Date[]
  month: number
  eventsByDate: Map<string, CalendarEvent[]>
  todayStr: string
  selectedDateStr: string
  showWeekends: boolean
  showWeekNumbers: boolean
  actions: DayActions
  onSelectDate: (date: Date) => void
  onOpenDay: (date: Date) => void
}

/**
 * The month as a wall planner: week rows share the height evenly, so the
 * grid always fills the screen and never scrolls, and each cell folds what
 * does not fit into a "+N more".
 */
export function MonthView({
  days,
  month,
  eventsByDate,
  todayStr,
  selectedDateStr,
  showWeekends,
  showWeekNumbers,
  actions,
  onSelectDate,
  onOpenDay,
}: MonthViewProps) {
  const format = useDayFormatter()
  const visibleDays = useMemo(
    () => (showWeekends ? days : days.filter((d) => !isWeekend(d))),
    [days, showWeekends]
  )
  const columns = showWeekends ? 7 : 5
  const rows = Math.max(1, Math.round(visibleDays.length / columns))
  const weekdayLabels = visibleDays
    .slice(0, columns)
    .map((d) => format.dateTime(d, { weekday: 'short' }))
  const weekStarts = days.filter((_, i) => i % 7 === 0)

  const gridTemplate = `${showWeekNumbers ? '2rem ' : ''}repeat(${columns}, minmax(0, 1fr))`

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="grid shrink-0 border-b border-border/70"
        style={{ gridTemplateColumns: gridTemplate }}
      >
        {showWeekNumbers && <div className="border-r border-border/70" />}
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="border-r border-border/70 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground last:border-r-0"
          >
            {label}
          </div>
        ))}
      </div>
      <div
        role="grid"
        className="grid min-h-0 flex-1 border-l border-border/70"
        style={{
          gridTemplateColumns: gridTemplate,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
        }}
      >
        {visibleDays.map((date, index) => {
          const dateStr = toLocalDateStr(date)
          const cell = (
            <CalendarDayCell
              key={dateStr}
              date={date}
              dateStr={dateStr}
              events={eventsByDate.get(dateStr) ?? []}
              isCurrentMonth={date.getMonth() === month}
              isToday={dateStr === todayStr}
              isSelected={dateStr === selectedDateStr}
              isWeekend={isWeekend(date)}
              actions={actions}
              onSelect={() => onSelectDate(date)}
              onOpenDay={() => onOpenDay(date)}
            />
          )
          if (!showWeekNumbers || index % columns !== 0) return cell
          const weekStart = weekStarts[Math.floor(index / columns)] ?? date
          return [
            <div
              key={`w-${dateStr}`}
              className={cn(
                'flex items-start justify-center border-b border-r border-border/70 bg-muted/20 pt-2 text-[11px] tabular-nums text-muted-foreground'
              )}
            >
              {isoWeekNumber(weekStart)}
            </div>,
            cell,
          ]
        })}
      </div>
    </div>
  )
}
