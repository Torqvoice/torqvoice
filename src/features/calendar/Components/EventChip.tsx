'use client'

import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { useDateSettings } from '@/components/date-settings-context'
import { formatClock } from '@/features/workboard/utils/clock'
import { cn } from '@/lib/utils'
import { timeToMinutes } from '../Lib/calendar-range'
import { eventPalette, isEventDone } from './calendar-utils'
import { EventContextMenu } from './EventContextMenu'
import { useEventPeek } from './EventPeek'
import type { CalendarEvent } from '../Actions/calendarActions'

/**
 * The one drawing of an event, in the shapes the views need:
 *
 * - `chip`  a tinted bar in a month cell or the all-day row
 * - `timed` a dot, the start time and the title, for a timed event in a month cell
 * - `block` a solid block on the time grid; the parent positions it
 * - `row`   a list row for the schedule view and the day sheet
 *
 * Every shape opens the same peek card on click and the same menu on
 * right-click, so nothing here links out.
 */
export function EventChip({
  event,
  variant,
  style,
  className,
  compact = false,
}: {
  event: CalendarEvent
  variant: 'chip' | 'timed' | 'block' | 'row'
  style?: CSSProperties
  className?: string
  /** Blocks shorter than a line drop the time and shrink the text. */
  compact?: boolean
}) {
  const { timeFormat } = useDateSettings()
  const { openPeek } = useEventPeek()
  const palette = eventPalette(event)
  const done = isEventDone(event)
  const start = event.time ? formatClock(timeToMinutes(event.time), timeFormat) : null
  const end = event.endTime ? formatClock(timeToMinutes(event.endTime), timeFormat) : null

  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    openPeek(event, e.currentTarget)
  }
  // The day underneath has a menu of its own; a right-click on the event
  // must open the event's, not both.
  const onContextMenu = (e: MouseEvent<HTMLButtonElement>) => e.stopPropagation()
  const label = start ? `${start} ${event.title}` : event.title

  let button: ReactNode

  if (variant === 'timed') {
    button = (
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={label}
        style={style}
        className={cn(
          'flex h-[22px] w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left text-xs leading-none transition-colors hover:bg-accent',
          done && 'opacity-60',
          className
        )}
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', palette.dot)} />
        {start && (
          <span className="hidden shrink-0 tabular-nums text-muted-foreground sm:inline">
            {start}
          </span>
        )}
        <span className={cn('truncate font-medium', done && 'line-through')}>{event.title}</span>
      </button>
    )
  } else if (variant === 'chip') {
    button = (
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={label}
        style={style}
        className={cn(
          'flex h-[22px] w-full min-w-0 items-center gap-1.5 rounded px-1.5 text-left text-xs font-medium leading-none transition-colors',
          palette.chip,
          done && 'opacity-60',
          className
        )}
      >
        {done && <Check className="h-3 w-3 shrink-0" />}
        <span className={cn('truncate', done && 'line-through')}>{event.title}</span>
        {start && !compact && (
          <span className="ml-auto shrink-0 tabular-nums opacity-70">{start}</span>
        )}
      </button>
    )
  } else if (variant === 'block') {
    button = (
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        title={end ? `${start} – ${end} ${event.title}` : label}
        style={style}
        className={cn(
          'absolute flex flex-col overflow-hidden rounded-md border px-1.5 py-1 text-left text-xs leading-tight shadow-sm transition-[filter,box-shadow] hover:z-20 hover:shadow-md',
          palette.block,
          done && 'opacity-70',
          compact && 'justify-center py-0',
          className
        )}
      >
        <span className={cn('truncate font-semibold', done && 'line-through')}>
          {compact && start ? `${start} ` : ''}
          {event.title}
        </span>
        {!compact && (
          <span className="truncate text-[11px] opacity-90">
            {start}
            {end ? ` – ${end}` : ''}
            {event.vehicleLabel ? ` · ${event.vehicleLabel}` : ''}
          </span>
        )}
      </button>
    )
  } else {
    button = (
      <button
        type="button"
        onClick={onClick}
        onContextMenu={onContextMenu}
        style={style}
        className={cn(
          'flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
          className
        )}
      >
        <span className="w-[6.5rem] shrink-0 pt-0.5 text-xs tabular-nums text-muted-foreground">
          {start ? (end ? `${start} – ${end}` : start) : null}
        </span>
        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', palette.dot)} />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate font-medium', done && 'line-through opacity-70')}>
            {event.title}
          </span>
          {(event.vehicleLabel || event.customerName) && (
            <span className="block truncate text-xs text-muted-foreground">
              {[event.vehicleLabel, event.customerName].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </button>
    )
  }

  return <EventContextMenu event={event}>{button}</EventContextMenu>
}
