'use client'

import Link from 'next/link'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import {
  ArrowUpRight,
  Bell,
  CalendarClock,
  Car,
  ExternalLink,
  FileText,
  Hash,
  Mail,
  MessageSquare,
  Send,
  User,
  Wrench,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useDateSettings } from '@/components/date-settings-context'
import { useFormatCurrency } from '@/components/currency-settings-context'
import { formatClock } from '@/features/workboard/utils/clock'
import { timeToMinutes } from '../Lib/calendar-range'
import { eventPalette, getEventLink, isEventDone } from './calendar-utils'
import { ExternalEventDialog } from './ExternalEventDialog'
import type { CalendarEvent } from '../Actions/calendarActions'

/**
 * One floating card for the whole calendar, anchored to whichever chip was
 * clicked, the way a desktop calendar peeks at an event before opening it.
 * A single popover instead of one per chip: a busy month can hold hundreds
 * of chips, and only one card is ever open.
 */
interface PeekState {
  event: CalendarEvent
  anchor: HTMLElement
}

interface PeekApi {
  openPeek: (event: CalendarEvent, anchor: HTMLElement) => void
  closePeek: () => void
}

const PeekContext = createContext<PeekApi>({
  openPeek: () => undefined,
  closePeek: () => undefined,
})

export function useEventPeek() {
  return useContext(PeekContext)
}

export function EventPeekProvider({
  currencyCode,
  children,
}: {
  currencyCode: string
  children: ReactNode
}) {
  const [peek, setPeek] = useState<PeekState | null>(null)
  const [external, setExternal] = useState<CalendarEvent | null>(null)
  // Radix measures the anchor through a ref, so the clicked element is handed
  // over as one; a new object each time so the popper re-measures.
  const anchorRef = useRef<HTMLElement | null>(null)
  anchorRef.current = peek?.anchor ?? null

  const openPeek = useCallback((event: CalendarEvent, anchor: HTMLElement) => {
    if (event.type === 'external') {
      setPeek(null)
      setExternal(event)
      return
    }
    setPeek((current) =>
      current && current.event === event && current.anchor === anchor ? null : { event, anchor }
    )
  }, [])
  const closePeek = useCallback(() => setPeek(null), [])
  const api = useMemo(() => ({ openPeek, closePeek }), [openPeek, closePeek])

  return (
    <PeekContext.Provider value={api}>
      {children}
      <Popover open={peek !== null} onOpenChange={(open) => !open && setPeek(null)}>
        <PopoverAnchor virtualRef={anchorRef as React.RefObject<HTMLElement>} />
        <PopoverContent
          side="right"
          align="start"
          collisionPadding={12}
          className="w-[22rem] max-w-[calc(100vw-1.5rem)] p-0 shadow-xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {peek && <PeekCard event={peek.event} currencyCode={currencyCode} onClose={closePeek} />}
        </PopoverContent>
      </Popover>
      <ExternalEventDialog event={external} onClose={() => setExternal(null)} />
    </PeekContext.Provider>
  )
}

function typeIcon(event: CalendarEvent) {
  switch (event.type) {
    case 'service':
      return Wrench
    case 'reminder':
      return Bell
    case 'quote':
      return FileText
    case 'message':
      return event.channel === 'email' ? Mail : event.channel === 'sms' ? MessageSquare : Send
    default:
      return CalendarClock
  }
}

function statusKey(event: CalendarEvent): string {
  if (event.type === 'service') {
    switch (event.status) {
      case 'completed':
        return 'completed'
      case 'in_progress':
      case 'in-progress':
        return 'inProgress'
      case 'waiting-parts':
        return 'waitingParts'
      case 'scheduled':
        return 'scheduled'
      default:
        return 'pending'
    }
  }
  if (event.type === 'message') {
    return event.status === 'sent' ? 'sent' : event.status === 'failed' ? 'failed' : 'queued'
  }
  if (event.type === 'quote') {
    return event.status === 'sent' ? 'sent' : event.status === 'approved' ? 'approved' : 'draft'
  }
  if (event.type === 'external') return 'busy'
  return event.status === 'completed' ? 'done' : event.status === 'overdue' ? 'overdue' : 'upcoming'
}

function PeekCard({
  event,
  currencyCode,
  onClose,
}: {
  event: CalendarEvent
  currencyCode: string
  onClose: () => void
}) {
  const t = useTranslations('calendar')
  const format = useDayFormatter()
  const { timeFormat } = useDateSettings()
  const formatCurrency = useFormatCurrency()
  const palette = eventPalette(event)
  const Icon = typeIcon(event)
  const day = new Date(`${event.date}T12:00:00`)
  const when = event.time
    ? event.endTime
      ? `${formatClock(timeToMinutes(event.time), timeFormat)} – ${formatClock(timeToMinutes(event.endTime), timeFormat)}`
      : formatClock(timeToMinutes(event.time), timeFormat)
    : t('events.external.allDay')
  const done = isEventDone(event)

  return (
    <div className="overflow-hidden rounded-md">
      <div className={`h-1.5 w-full ${palette.rule}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${palette.chip}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`break-words text-base font-semibold leading-snug ${done ? 'text-muted-foreground line-through' : ''}`}
            >
              {event.title}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {format.dateTime(day, { weekday: 'long', day: 'numeric', month: 'long' })}
              <span className="mx-1.5 text-border">·</span>
              {when}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 h-8 w-8 shrink-0"
            onClick={onClose}
            aria-label={t('peek.close')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className={`text-[10px] ${palette.chip}`}>
            {t(`events.type.${event.type}`)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {t(`events.status.${statusKey(event)}`)}
          </Badge>
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          {event.vehicleLabel && (
            <div className="flex items-center gap-2">
              <Car className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <dd className="truncate">{event.vehicleLabel}</dd>
            </div>
          )}
          {event.customerName && (
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <dd className="truncate">{event.customerName}</dd>
            </div>
          )}
          {(event.invoiceNumber || event.amount != null) && (
            <div className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <dd className="flex flex-1 items-center gap-2 truncate">
                {event.invoiceNumber && (
                  <span className="text-muted-foreground">{event.invoiceNumber}</span>
                )}
                {event.amount != null && (
                  <span className="ml-auto font-medium tabular-nums">
                    {formatCurrency(event.amount, currencyCode)}
                  </span>
                )}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button asChild size="sm">
            <Link href={getEventLink(event)}>
              {t(`peek.open.${event.type}`)}
              {event.type === 'external' ? (
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              ) : (
                <ArrowUpRight className="ml-1.5 h-3.5 w-3.5" />
              )}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
