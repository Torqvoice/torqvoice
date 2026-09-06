'use client'

import { useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { DayContextMenu, type DayActions } from './DayContextMenu'
import { EventChip } from './EventChip'
import { eventKey } from './calendar-utils'
import type { CalendarEvent } from '../Actions/calendarActions'

/** Height of one chip row plus its gap, in pixels; the overflow maths depends on it. */
const ROW_PX = 24
/** Room the "+N more" line takes when it is shown. */
const MORE_PX = 20

interface CalendarDayCellProps {
  date: Date
  dateStr: string
  /** Already filtered and sorted for this day. */
  events: CalendarEvent[]
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  isWeekend: boolean
  actions: DayActions
  onSelect: () => void
  /** Day number clicked: jump into that day. */
  onOpenDay: () => void
}

/**
 * One day of the month grid. Chips fill whatever height the row was given
 * and the rest fold into a "+N more" line that opens the whole day in a
 * popover, so a day with forty jobs stays the same height as an empty one.
 */
export function CalendarDayCell({
  date,
  dateStr,
  events,
  isCurrentMonth,
  isToday,
  isSelected,
  isWeekend,
  actions,
  onSelect,
  onOpenDay,
}: CalendarDayCellProps) {
  const t = useTranslations('calendar')
  const format = useDayFormatter()
  const cellRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Measured height of the chip area; null until the browser has laid it out.
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const measure = () => setHeight(el.clientHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fitsAll = height === null ? 3 : Math.floor(height / ROW_PX)
  // Only give a row up to the "more" line when something has to fold.
  const withMore = height === null ? 2 : Math.floor((height - MORE_PX) / ROW_PX)
  const visibleCount = events.length <= fitsAll ? events.length : Math.max(0, withMore)
  const hidden = events.length - visibleCount
  const dayNumber = date.getDate()
  const dayLabel =
    dayNumber === 1 ? format.dateTime(date, { day: 'numeric', month: 'short' }) : String(dayNumber)

  const openDay = (e: MouseEvent) => {
    e.stopPropagation()
    onOpenDay()
  }

  return (
    <DayContextMenu
      date={date}
      dateStr={dateStr}
      events={events}
      actions={actions}
      onOpen={() => !isSelected && onSelect()}
      getAnchor={() => cellRef.current}
    >
      <div
        ref={cellRef}
        role="gridcell"
        aria-selected={isSelected}
        aria-label={format.dateTime(date, { dateStyle: 'full' })}
        onClick={onSelect}
        onDoubleClick={openDay}
        className={cn(
          'group/day relative flex min-h-0 min-w-0 cursor-default flex-col border-b border-r border-border/70 transition-colors',
          !isCurrentMonth && 'bg-muted/30',
          isWeekend && isCurrentMonth && 'bg-muted/15',
          isSelected ? 'bg-primary/5' : 'hover:bg-accent/40'
        )}
      >
        {isSelected && (
          <div className="pointer-events-none absolute inset-0 z-10 ring-2 ring-inset ring-primary/60" />
        )}
        <div className="flex h-7 shrink-0 items-center justify-center pt-1">
          <button
            type="button"
            onClick={openDay}
            className={cn(
              'flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums transition-colors',
              isToday
                ? 'bg-primary font-bold text-primary-foreground'
                : isCurrentMonth
                  ? 'text-foreground hover:bg-accent'
                  : 'text-muted-foreground/60 hover:bg-accent'
            )}
            aria-label={t('openDay', { date: format.dateTime(date, { dateStyle: 'long' }) })}
          >
            {dayLabel}
          </button>
        </div>
        <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-0.5 px-1 pb-1">
          {events.slice(0, visibleCount).map((event) => (
            <EventChip
              key={eventKey(event)}
              event={event}
              variant={event.time ? 'timed' : 'chip'}
              compact
            />
          ))}
          {hidden > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 shrink-0 rounded px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {t('more', { count: hidden })}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-72 p-2"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <div className="mb-1.5 flex items-baseline justify-between px-1">
                  <span className="text-sm font-semibold">
                    {format.dateTime(date, { weekday: 'long', day: 'numeric', month: 'long' })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t('dayTotal', { count: events.length })}
                  </span>
                </div>
                <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto">
                  {events.map((event) => (
                    <EventChip
                      key={eventKey(event)}
                      event={event}
                      variant={event.time ? 'timed' : 'chip'}
                    />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    </DayContextMenu>
  )
}
