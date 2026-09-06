'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { Check, ExternalLink, Trash2, Undo2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useConfirm } from '@/components/confirm-dialog'
import { deleteReminder, toggleReminder } from '@/features/vehicles/Actions/reminderActions'
import { deleteScheduledMessage } from '@/features/scheduled-messages/Actions/scheduledMessageActions'
import { getEventLink } from './calendar-utils'
import { useEventPeek } from './EventPeek'
import type { CalendarEvent } from '../Actions/calendarActions'

/**
 * Right-click on an event: open it, and for the things the calendar owns
 * outright, act on them here. A reminder can be ticked off or deleted; a
 * scheduled message can be deleted before it goes out. Work orders and
 * quotes carry money and paper, so they are only opened from here.
 */
export function EventContextMenu({
  event,
  children,
}: {
  event: CalendarEvent
  children: ReactNode
}) {
  const t = useTranslations('calendar.eventMenu')
  const router = useRouter()
  const confirm = useConfirm()
  const { refresh } = useEventPeek()

  const open = () => {
    if (event.type === 'external') {
      if (event.externalUrl) window.open(event.externalUrl, '_blank', 'noopener')
      return
    }
    router.push(getEventLink(event))
  }

  const run = async (
    action: () => Promise<{ success: boolean; error?: string }>,
    doneMessage: string
  ) => {
    const result = await action()
    if (result.success) {
      toast.success(doneMessage)
      refresh()
    } else {
      toast.error(result.error || t('failed'))
    }
  }

  const removeReminder = async () => {
    const ok = await confirm({
      description: t('deleteReminderConfirm', { title: event.title }),
      destructive: true,
    })
    if (ok) await run(() => deleteReminder(event.id), t('deleted'))
  }

  const removeMessage = async () => {
    const ok = await confirm({
      description: t('deleteMessageConfirm', { title: event.title }),
      destructive: true,
    })
    if (ok) await run(() => deleteScheduledMessage(event.id), t('deleted'))
  }

  const reminderDone = event.type === 'reminder' && event.status === 'completed'

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        <ContextMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {event.title}
        </ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={open}>
          <ExternalLink className="mr-2 h-4 w-4" />
          {t('open')}
        </ContextMenuItem>
        {event.type === 'reminder' && (
          <>
            <ContextMenuItem onClick={() => run(() => toggleReminder(event.id), t('updated'))}>
              {reminderDone ? (
                <Undo2 className="mr-2 h-4 w-4" />
              ) : (
                <Check className="mr-2 h-4 w-4" />
              )}
              {reminderDone ? t('markNotDone') : t('markDone')}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={removeReminder}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('deleteReminder')}
            </ContextMenuItem>
          </>
        )}
        {event.type === 'message' && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onClick={removeMessage}>
              <Trash2 className="mr-2 h-4 w-4" />
              {t('deleteMessage')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
