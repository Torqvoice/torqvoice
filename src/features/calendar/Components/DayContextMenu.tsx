'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, ExternalLink, FileText, Send, Wrench } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useDateSettings } from '@/components/date-settings-context'
import { useFormatDate } from '@/lib/use-format-date'
import { formatClock } from '@/features/workboard/utils/clock'
import { timeToMinutes } from '../Lib/calendar-range'
import { eventKey, eventPalette } from './calendar-utils'
import { useEventPeek } from './EventPeek'
import type { CalendarEvent } from '../Actions/calendarActions'

/** What a right-click on a day (or a time slot) can start. */
export interface DayActions {
  /** `time` is HH:MM when the click landed on a time slot. */
  onNewWorkOrder: (dateStr: string, time?: string) => void
  onNewReminder: (dateStr: string, time?: string) => void
  onNewQuote: (dateStr: string, time?: string) => void
  onScheduleMessage: (dateStr: string, time?: string) => void
}

/** How many of the day's events the right-click menu lists before it stops */
const MAX_MENU_EVENTS = 8

/**
 * The right-click menu every day carries: create something on that day, or
 * open one of the things already on it. The time grid passes the slot's time
 * so a new work order lands at that hour.
 */
export function DayContextMenu({
  date,
  dateStr,
  events,
  actions,
  time,
  onOpen,
  getAnchor,
  children,
}: {
  date: Date
  dateStr: string
  events: CalendarEvent[]
  actions: DayActions
  /** HH:MM of the slot the menu was opened on, when there is one. */
  time?: string | null
  /** Called when the menu opens, so the day it is about becomes the selected one. */
  onOpen?: () => void
  /** The element a peek opened from the menu anchors to; the menu item itself is gone by then. */
  getAnchor?: () => HTMLElement | null
  children: ReactNode
}) {
  const t = useTranslations('calendar')
  const { formatDate } = useFormatDate()
  const { timeFormat } = useDateSettings()
  const { openPeek } = useEventPeek()
  // A message cannot go out at a time that has passed: a whole day that is
  // over, or a slot earlier today, gets no such option.
  const messageSlotPassed = new Date(`${dateStr}T${time ?? '23:59'}:00`).getTime() < Date.now()

  return (
    <ContextMenu onOpenChange={(open) => open && onOpen?.()}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
          {formatDate(date)}
          {time ? ` · ${formatClock(timeToMinutes(time), timeFormat)}` : ''}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => actions.onNewWorkOrder(dateStr, time ?? undefined)}>
          <Wrench className="mr-2 h-4 w-4" />
          {time
            ? t('contextMenu.newWorkOrderAt', {
                time: formatClock(timeToMinutes(time), timeFormat),
              })
            : t('contextMenu.newWorkOrder')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.onNewReminder(dateStr, time ?? undefined)}>
          <Bell className="mr-2 h-4 w-4" />
          {t('contextMenu.newReminder')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => actions.onNewQuote(dateStr, time ?? undefined)}>
          <FileText className="mr-2 h-4 w-4" />
          {t('contextMenu.newQuote')}
        </ContextMenuItem>
        {!messageSlotPassed && (
          <ContextMenuItem onClick={() => actions.onScheduleMessage(dateStr, time ?? undefined)}>
            <Send className="mr-2 h-4 w-4" />
            {t('contextMenu.scheduleMessage')}
          </ContextMenuItem>
        )}
        {events.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('contextMenu.openEvent', { count: events.length })}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-w-72">
                {events.slice(0, MAX_MENU_EVENTS).map((event) => (
                  <ContextMenuItem
                    key={eventKey(event)}
                    onClick={(e) => {
                      const fallback = e.currentTarget as HTMLElement
                      // The menu closes on click and takes the item with it, so
                      // the peek hangs off the day instead.
                      setTimeout(() => openPeek(event, getAnchor?.() ?? fallback), 0)
                    }}
                  >
                    <div
                      className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${eventPalette(event).dot}`}
                    />
                    <span className="truncate">{event.title}</span>
                  </ContextMenuItem>
                ))}
                {events.length > MAX_MENU_EVENTS && (
                  <ContextMenuItem disabled>
                    {t('more', { count: events.length - MAX_MENU_EVENTS })}
                  </ContextMenuItem>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
