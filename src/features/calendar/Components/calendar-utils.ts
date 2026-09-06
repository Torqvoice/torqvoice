import { serviceRecordHref } from '@/lib/service-record'
import type { CalendarEvent } from '../Actions/calendarActions'

export { toLocalDateStr } from '../Lib/calendar-range'

/**
 * Where an event points: the work order, the quote, the reminders list, the
 * scheduled messages tab. External events have no page here; they open a
 * dialog, or the vendor's calendar, and only land on the integrations list
 * as a last resort.
 */
export function getEventLink(event: {
  id: string
  type: CalendarEvent['type']
  vehicleId: string | null
}): string {
  if (event.type === 'external') return '/settings/integrations'
  if (event.type === 'quote') return `/quotes/${event.id}`
  if (event.type === 'message') return '/messages?tab=scheduled'
  if (event.type === 'reminder')
    return event.vehicleId ? `/vehicles/${event.vehicleId}` : '/reminders'
  return serviceRecordHref({ id: event.id, vehicleId: event.vehicleId })
}

export function formatDateHeader(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/** A stable React key: ids can repeat across types (and external days). */
export function eventKey(event: Pick<CalendarEvent, 'id' | 'type'>): string {
  return `${event.type}-${event.id}`
}

/**
 * One colour family per event type, the way a desktop calendar gives each
 * calendar its own hue, with the status pushing the shade: done turns green,
 * late or failed turns red, waiting-for-parts turns orange. Every view draws
 * from these same classes so a chip in the month, a block in the week and a
 * row in the schedule all read as the same thing.
 */
export interface EventPalette {
  /** Solid dot beside a timed event or in a year cell. */
  dot: string
  /** Soft tinted chip for all-day rows, month cells and lists. */
  chip: string
  /** Solid block on the time grid. */
  block: string
  /** Text colour for a plain-text chip. */
  text: string
  /** Left rule on a peek card or list row. */
  rule: string
}

type Hue = 'blue' | 'amber' | 'violet' | 'teal' | 'slate' | 'emerald' | 'orange' | 'red'

const PALETTES: Record<Hue, EventPalette> = {
  blue: {
    dot: 'bg-blue-500',
    chip: 'bg-blue-500/15 text-blue-900 hover:bg-blue-500/25 dark:text-blue-200',
    block: 'bg-blue-600 text-white border-blue-700/60 hover:bg-blue-700',
    text: 'text-blue-800 dark:text-blue-300',
    rule: 'bg-blue-500',
  },
  amber: {
    dot: 'bg-amber-500',
    chip: 'bg-amber-500/20 text-amber-950 hover:bg-amber-500/30 dark:text-amber-200',
    block: 'bg-amber-500 text-amber-950 border-amber-600/60 hover:bg-amber-600',
    text: 'text-amber-800 dark:text-amber-300',
    rule: 'bg-amber-500',
  },
  violet: {
    dot: 'bg-violet-500',
    chip: 'bg-violet-500/15 text-violet-950 hover:bg-violet-500/25 dark:text-violet-200',
    block: 'bg-violet-600 text-white border-violet-700/60 hover:bg-violet-700',
    text: 'text-violet-800 dark:text-violet-300',
    rule: 'bg-violet-500',
  },
  teal: {
    dot: 'bg-teal-500',
    chip: 'bg-teal-500/15 text-teal-950 hover:bg-teal-500/25 dark:text-teal-200',
    block: 'bg-teal-600 text-white border-teal-700/60 hover:bg-teal-700',
    text: 'text-teal-800 dark:text-teal-300',
    rule: 'bg-teal-500',
  },
  slate: {
    dot: 'bg-slate-400',
    chip: 'bg-slate-500/15 text-slate-700 hover:bg-slate-500/25 dark:text-slate-300',
    block: 'bg-slate-500 text-white border-slate-600/60 hover:bg-slate-600',
    text: 'text-slate-600 dark:text-slate-400',
    rule: 'bg-slate-400',
  },
  emerald: {
    dot: 'bg-emerald-500',
    chip: 'bg-emerald-500/15 text-emerald-950 hover:bg-emerald-500/25 dark:text-emerald-200',
    block: 'bg-emerald-600 text-white border-emerald-700/60 hover:bg-emerald-700',
    text: 'text-emerald-800 dark:text-emerald-300',
    rule: 'bg-emerald-500',
  },
  orange: {
    dot: 'bg-orange-500',
    chip: 'bg-orange-500/15 text-orange-950 hover:bg-orange-500/25 dark:text-orange-200',
    block: 'bg-orange-500 text-white border-orange-600/60 hover:bg-orange-600',
    text: 'text-orange-800 dark:text-orange-300',
    rule: 'bg-orange-500',
  },
  red: {
    dot: 'bg-red-500',
    chip: 'bg-red-500/15 text-red-950 hover:bg-red-500/25 dark:text-red-200',
    block: 'bg-red-600 text-white border-red-700/60 hover:bg-red-700',
    text: 'text-red-800 dark:text-red-300',
    rule: 'bg-red-500',
  },
}

/** The hue a type carries before status pushes it around; used by legends. */
export const TYPE_HUE: Record<CalendarEvent['type'], Hue> = {
  service: 'blue',
  reminder: 'amber',
  quote: 'violet',
  message: 'teal',
  external: 'slate',
}

export function typePalette(type: CalendarEvent['type']): EventPalette {
  return PALETTES[TYPE_HUE[type]]
}

export function eventHue(event: Pick<CalendarEvent, 'type' | 'status'>): Hue {
  switch (event.type) {
    case 'service':
      switch (event.status) {
        case 'completed':
          return 'emerald'
        case 'waiting-parts':
          return 'orange'
        default:
          return 'blue'
      }
    case 'reminder':
      switch (event.status) {
        case 'completed':
          return 'emerald'
        case 'overdue':
          return 'red'
        default:
          return 'amber'
      }
    case 'quote':
      return event.status === 'approved' ? 'emerald' : 'violet'
    case 'message':
      return event.status === 'failed' ? 'red' : 'teal'
    default:
      return 'slate'
  }
}

export function eventPalette(event: Pick<CalendarEvent, 'type' | 'status'>): EventPalette {
  return PALETTES[eventHue(event)]
}

/** Done things sit quietly: a completed job or reminder is dimmed and struck. */
export function isEventDone(event: Pick<CalendarEvent, 'type' | 'status'>): boolean {
  return (
    (event.type === 'service' && event.status === 'completed') ||
    (event.type === 'reminder' && event.status === 'completed') ||
    (event.type === 'message' && event.status === 'sent')
  )
}

/** All-day items come first, then by clock time, then by title. */
export function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  if (!a.time !== !b.time) return a.time ? 1 : -1
  if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1
  return a.title.localeCompare(b.title)
}
