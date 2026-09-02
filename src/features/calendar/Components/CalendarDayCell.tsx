'use client'

import { useRouter } from 'next/navigation'
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
import { useFormatDate } from '@/lib/use-format-date'
import { getEventLink, toLocalDateStr } from './calendar-utils'
import type { CalendarEvent } from '../Actions/calendarActions'

function getEventDotColor(event: CalendarEvent) {
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
  // reminder
  switch (event.status) {
    case 'completed':
      return 'bg-emerald-500'
    case 'overdue':
      return 'bg-red-500'
    default:
      return 'bg-slate-400'
  }
}

/** How many of the day's events the right-click menu lists before it stops */
const MAX_MENU_EVENTS = 8

interface CalendarDayCellProps {
  date: Date
  events: CalendarEvent[]
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  onClick: () => void
  onNewWorkOrder: () => void
  onNewReminder: () => void
  onNewQuote: () => void
  onScheduleMessage: () => void
}

export function CalendarDayCell({
  date,
  events,
  isCurrentMonth,
  isToday,
  isSelected,
  onClick,
  onNewWorkOrder,
  onNewReminder,
  onNewQuote,
  onScheduleMessage,
}: CalendarDayCellProps) {
  const t = useTranslations('calendar')
  const router = useRouter()
  const { formatDate } = useFormatDate()
  const dateStr = toLocalDateStr(date)
  const dayEvents = events.filter((e) => e.date === dateStr)
  const serviceCount = dayEvents.filter((e) => e.type === 'service').length
  const reminderCount = dayEvents.filter((e) => e.type === 'reminder').length
  const quoteCount = dayEvents.filter((e) => e.type === 'quote').length

  return (
    <ContextMenu
      // Right-clicking a day also selects it, so the sidebar and any dialog
      // the menu opens are talking about the same date.
      onOpenChange={(open) => {
        if (open && !isSelected) onClick()
      }}
    >
      <ContextMenuTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className={`
            relative flex flex-col items-center justify-start p-1 min-h-[80px] w-full rounded-md text-sm transition-colors
            ${isCurrentMonth ? '' : 'text-muted-foreground/40'}
            ${isToday && !isSelected ? 'bg-primary/10' : ''}
            ${isSelected ? 'ring-2 ring-primary bg-primary/5' : 'hover:bg-muted/50'}
          `}
        >
          <span
            className={`
              flex h-6 w-6 items-center justify-center rounded-full text-xs
              ${isToday ? 'bg-primary text-primary-foreground font-bold' : ''}
            `}
          >
            {date.getDate()}
          </span>
          {dayEvents.length > 0 && (
            <div className="flex flex-col gap-0.5 mt-0.5 w-full px-0.5">
              {/* Show up to 3 mini event labels on larger screens */}
              {dayEvents.slice(0, 2).map((event) => (
                <div
                  key={`${event.type}-${event.id}`}
                  className={`hidden sm:flex items-center gap-1 rounded px-1 py-0 text-[10px] leading-tight truncate ${getEventBgColor(event)}`}
                >
                  <div className={`h-1 w-1 shrink-0 rounded-full ${getEventDotColor(event)}`} />
                  <span className="truncate">{event.title}</span>
                </div>
              ))}
              {dayEvents.length > 2 && (
                <span className="hidden sm:block text-[9px] text-muted-foreground px-1">
                  {t('more', { count: dayEvents.length - 2 })}
                </span>
              )}
              {/* Mobile: show dots */}
              <div className="flex sm:hidden gap-0.5 justify-center flex-wrap">
                {serviceCount > 0 && (
                  <div className="flex items-center gap-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    {serviceCount > 1 && (
                      <span className="text-[8px] text-muted-foreground">{serviceCount}</span>
                    )}
                  </div>
                )}
                {reminderCount > 0 && (
                  <div className="flex items-center gap-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {reminderCount > 1 && (
                      <span className="text-[8px] text-muted-foreground">{reminderCount}</span>
                    )}
                  </div>
                )}
                {quoteCount > 0 && (
                  <div className="flex items-center gap-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                    {quoteCount > 1 && (
                      <span className="text-[8px] text-muted-foreground">{quoteCount}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </button>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-56">
        <ContextMenuLabel className="text-xs font-normal text-muted-foreground">
          {formatDate(date)}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onNewWorkOrder}>
          <Wrench className="mr-2 h-4 w-4" />
          {t('contextMenu.newWorkOrder')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onNewReminder}>
          <Bell className="mr-2 h-4 w-4" />
          {t('contextMenu.newReminder')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onNewQuote}>
          <FileText className="mr-2 h-4 w-4" />
          {t('contextMenu.newQuote')}
        </ContextMenuItem>
        <ContextMenuItem onClick={onScheduleMessage}>
          <Send className="mr-2 h-4 w-4" />
          {t('contextMenu.scheduleMessage')}
        </ContextMenuItem>
        {dayEvents.length > 0 && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <ExternalLink className="mr-2 h-4 w-4" />
                {t('contextMenu.openEvent', { count: dayEvents.length })}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-w-72">
                {dayEvents.slice(0, MAX_MENU_EVENTS).map((event) => (
                  <ContextMenuItem
                    key={`${event.type}-${event.id}`}
                    onClick={() => router.push(getEventLink(event))}
                  >
                    <div
                      className={`mr-2 h-1.5 w-1.5 shrink-0 rounded-full ${getEventDotColor(event)}`}
                    />
                    <span className="truncate">{event.title}</span>
                  </ContextMenuItem>
                ))}
                {dayEvents.length > MAX_MENU_EVENTS && (
                  <ContextMenuItem disabled>
                    {t('more', { count: dayEvents.length - MAX_MENU_EVENTS })}
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

function getEventBgColor(event: CalendarEvent) {
  if (event.type === 'external') {
    return 'bg-slate-500/10 text-slate-600 dark:text-slate-400 italic'
  }
  if (event.type === 'service') {
    switch (event.status) {
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      case 'in_progress':
      case 'in-progress':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-400'
      case 'waiting-parts':
        return 'bg-orange-500/10 text-orange-700 dark:text-orange-400'
      default:
        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
    }
  }
  if (event.type === 'quote') {
    return 'bg-violet-500/10 text-violet-700 dark:text-violet-400'
  }
  if (event.type === 'message') {
    return event.status === 'failed'
      ? 'bg-red-500/10 text-red-700 dark:text-red-400'
      : 'bg-sky-500/10 text-sky-700 dark:text-sky-400'
  }
  switch (event.status) {
    case 'overdue':
      return 'bg-red-500/10 text-red-700 dark:text-red-400'
    default:
      return 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
  }
}
