'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { CalendarClock, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatDateHeader, getEventLink } from './calendar-utils'
import { useFormatCurrency } from '@/components/currency-settings-context'
import type { CalendarEvent } from '../Actions/calendarActions'

function getStatusColor(event: CalendarEvent) {
  if (event.type === 'external') return 'bg-slate-400'
  if (event.type === 'service') {
    switch (event.status) {
      case 'completed':
        return 'bg-emerald-500'
      case 'in_progress':
      case 'in-progress':
        return 'bg-blue-500'
      case 'waiting-parts':
        return 'bg-orange-500'
      default:
        return 'bg-amber-500'
    }
  }
  if (event.type === 'quote') {
    return event.status === 'sent' ? 'bg-violet-500' : 'bg-violet-300'
  }
  if (event.type === 'message') {
    switch (event.status) {
      case 'sent':
        return 'bg-teal-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-sky-500'
    }
  }
  switch (event.status) {
    case 'completed':
      return 'bg-emerald-500'
    case 'overdue':
      return 'bg-red-500'
    default:
      return 'bg-slate-400'
  }
}

function getStatusBadge(event: CalendarEvent, t: (key: string) => string) {
  if (event.type === 'external') {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {t('events.status.busy')}
      </Badge>
    )
  }
  if (event.type === 'service') {
    switch (event.status) {
      case 'completed':
        return (
          <Badge
            variant="outline"
            className="text-emerald-600 border-emerald-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.completed')}
          </Badge>
        )
      case 'in_progress':
      case 'in-progress':
        return (
          <Badge
            variant="outline"
            className="text-blue-600 border-blue-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.inProgress')}
          </Badge>
        )
      case 'waiting-parts':
        return (
          <Badge
            variant="outline"
            className="text-orange-600 border-orange-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.waitingParts')}
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="text-amber-600 border-amber-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.pending')}
          </Badge>
        )
    }
  }
  if (event.type === 'message') {
    switch (event.status) {
      case 'sent':
        return (
          <Badge
            variant="outline"
            className="text-teal-600 border-teal-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.sent')}
          </Badge>
        )
      case 'failed':
        return (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            {t('events.status.failed')}
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-sky-600 border-sky-300 text-[10px] px-1.5 py-0">
            {t('events.status.queued')}
          </Badge>
        )
    }
  }
  if (event.type === 'quote') {
    switch (event.status) {
      case 'sent':
        return (
          <Badge
            variant="outline"
            className="text-violet-600 border-violet-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.sent')}
          </Badge>
        )
      case 'approved':
        return (
          <Badge
            variant="outline"
            className="text-emerald-600 border-emerald-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.approved')}
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="text-violet-600 border-violet-300 text-[10px] px-1.5 py-0"
          >
            {t('events.status.draft')}
          </Badge>
        )
    }
  }
  switch (event.status) {
    case 'completed':
      return (
        <Badge
          variant="outline"
          className="text-emerald-600 border-emerald-300 text-[10px] px-1.5 py-0"
        >
          {t('events.status.done')}
        </Badge>
      )
    case 'overdue':
      return (
        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
          {t('events.status.overdue')}
        </Badge>
      )
    default:
      return (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {t('events.status.upcoming')}
        </Badge>
      )
  }
}

function getTypeBadge(type: CalendarEvent['type'], t: (key: string) => string) {
  switch (type) {
    case 'service':
      return (
        <Badge
          variant="secondary"
          className="shrink-0 text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-700 dark:text-blue-400"
        >
          {t('events.type.service')}
        </Badge>
      )
    case 'reminder':
      return (
        <Badge
          variant="secondary"
          className="shrink-0 text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 dark:text-amber-400"
        >
          {t('events.type.reminder')}
        </Badge>
      )
    case 'quote':
      return (
        <Badge
          variant="secondary"
          className="shrink-0 text-[10px] px-1.5 py-0 bg-violet-500/10 text-violet-700 dark:text-violet-400"
        >
          {t('events.type.quote')}
        </Badge>
      )
    case 'message':
      return (
        <Badge
          variant="secondary"
          className="shrink-0 text-[10px] px-1.5 py-0 bg-sky-500/10 text-sky-700 dark:text-sky-400"
        >
          {t('events.type.message')}
        </Badge>
      )
  }
}

interface CalendarEventListProps {
  events: CalendarEvent[]
  dateStr: string // YYYY-MM-DD
  selectedDate: Date
  currencyCode: string
}

export function CalendarEventList({
  events,
  dateStr,
  selectedDate,
  currencyCode,
}: CalendarEventListProps) {
  const formatCurrency = useFormatCurrency()
  const t = useTranslations('calendar')
  const dayEvents = events.filter((e) => e.date === dateStr)
  // Busy time from a connected calendar has no page of its own here, so a
  // click opens it in place instead of sending the reader to settings.
  const [external, setExternal] = useState<CalendarEvent | null>(null)

  const rowClass =
    'flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors hover:bg-muted/50'
  const body = (event: CalendarEvent) => (
    <>
      <div className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${getStatusColor(event)}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium truncate">{event.title}</p>
          {getStatusBadge(event, t)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-xs text-muted-foreground truncate">
            {event.type === 'external' && event.source
              ? t('events.external.source', { source: event.source })
              : event.vehicleLabel}
          </p>
          {event.time && (
            <span className="text-xs text-muted-foreground shrink-0">
              {event.endTime ? `${event.time} – ${event.endTime}` : event.time}
            </span>
          )}
          {event.type === 'external' && event.allDay && (
            <span className="text-xs text-muted-foreground shrink-0">
              {t('events.external.allDay')}
            </span>
          )}
        </div>
        {event.customerName && (
          <p className="text-xs text-muted-foreground">{event.customerName}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {getTypeBadge(event.type, t)}
          {event.invoiceNumber && (
            <span className="text-[10px] text-muted-foreground">#{event.invoiceNumber}</span>
          )}
          {event.amount != null && (
            <span className="text-[10px] font-medium ml-auto">
              {formatCurrency(event.amount, currencyCode)}
            </span>
          )}
        </div>
      </div>
    </>
  )

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold">{formatDateHeader(selectedDate)}</p>

      {dayEvents.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground mb-1">{t('events.noEvents')}</p>
          <p className="text-xs text-muted-foreground">{t('events.selectDay')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {dayEvents.map((event) =>
            event.type === 'external' ? (
              <button
                key={`${event.type}-${event.id}`}
                type="button"
                onClick={() => setExternal(event)}
                className={rowClass}
              >
                {body(event)}
              </button>
            ) : (
              <Link
                key={`${event.type}-${event.id}`}
                href={getEventLink(event)}
                className={rowClass}
              >
                {body(event)}
              </Link>
            )
          )}
        </div>
      )}
      <ExternalEventDialog event={external} onClose={() => setExternal(null)} />
    </div>
  )
}

/**
 * What a busy block from Google or Outlook is: title, when, which calendar,
 * and a way to open it there. Nothing here edits it; the vendor owns it.
 */
function ExternalEventDialog({
  event,
  onClose,
}: {
  event: CalendarEvent | null
  onClose: () => void
}) {
  const t = useTranslations('calendar.events.external')
  const format = useFormatter()
  const day = event ? new Date(`${event.date}T00:00:00`) : null
  return (
    <Dialog open={event !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {event && day && (
          <>
            <DialogHeader>
              <DialogTitle className="break-words">{event.title}</DialogTitle>
              <DialogDescription>
                {event.source ? t('source', { source: event.source }) : t('sourceUnknown')}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-start gap-3 text-sm">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p>{format.dateTime(day, { dateStyle: 'full' })}</p>
                <p className="text-muted-foreground">
                  {event.allDay || !event.time
                    ? t('allDay')
                    : event.endTime
                      ? `${event.time} – ${event.endTime}`
                      : event.time}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('readOnly')}</p>
            <DialogFooter>
              {event.externalUrl ? (
                <Button asChild>
                  <a href={event.externalUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    {event.source ? t('open', { source: event.source }) : t('openGeneric')}
                  </a>
                </Button>
              ) : (
                <p className="text-xs text-muted-foreground">{t('noLink')}</p>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
