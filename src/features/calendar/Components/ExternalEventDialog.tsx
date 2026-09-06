'use client'

import { useTranslations } from 'next-intl'
import { useDayFormatter } from './useDayFormatter'
import { CalendarClock, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CalendarEvent } from '../Actions/calendarActions'

/**
 * What a busy block from Google or Outlook is: title, when, which calendar,
 * and a way to open it there. Nothing here edits it; the vendor owns it.
 */
export function ExternalEventDialog({
  event,
  onClose,
}: {
  event: CalendarEvent | null
  onClose: () => void
}) {
  const t = useTranslations('calendar.events.external')
  const format = useDayFormatter()
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
