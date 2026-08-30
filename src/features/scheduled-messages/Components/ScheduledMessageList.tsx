'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import {
  AlertTriangle,
  CalendarClock,
  Loader2,
  MoreVertical,
  Pencil,
  Repeat,
  Send,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useFormatDate } from '@/lib/use-format-date'
import { cn } from '@/lib/utils'
import {
  cancelScheduledMessage,
  deleteScheduledMessage,
  sendScheduledMessageNow,
  type ScheduledMessageListItem,
} from '../Actions/scheduledMessageActions'
import { CHANNEL_ICONS, ScheduleMessageDialog } from './ScheduleMessageDialog'
import type { MessageChannel } from '../Schema/scheduledMessageSchema'

type StatusFilter = 'upcoming' | 'sent' | 'failed' | 'cancelled' | 'all'

const STATUS_FILTERS: StatusFilter[] = ['upcoming', 'sent', 'failed', 'cancelled', 'all']

function statusBadgeClass(status: string) {
  switch (status) {
    case 'sent':
      return 'text-teal-600 border-teal-300'
    case 'failed':
      return 'text-red-600 border-red-300'
    case 'cancelled':
      return 'text-muted-foreground'
    default:
      return 'text-sky-600 border-sky-300'
  }
}

interface ScheduledMessageListProps {
  messages: ScheduledMessageListItem[]
  availableChannels: MessageChannel[]
  onChanged: () => void
}

export function ScheduledMessageList({
  messages,
  availableChannels,
  onChanged,
}: ScheduledMessageListProps) {
  const t = useTranslations('scheduledMessages.list')
  const td = useTranslations('scheduledMessages.dialog')
  const tc = useTranslations('common.buttons')
  const { formatDate, formatTime } = useFormatDate()

  const [filter, setFilter] = useState<StatusFilter>('upcoming')
  const [editing, setEditing] = useState<ScheduledMessageListItem | undefined>()
  const [showDialog, setShowDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ScheduledMessageListItem | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (filter === 'all') return messages
    if (filter === 'upcoming') return messages.filter((m) => m.status === 'scheduled')
    return messages.filter((m) => m.status === filter)
  }, [messages, filter])

  const counts = useMemo(
    () => ({
      upcoming: messages.filter((m) => m.status === 'scheduled').length,
      sent: messages.filter((m) => m.status === 'sent').length,
      failed: messages.filter((m) => m.status === 'failed').length,
      cancelled: messages.filter((m) => m.status === 'cancelled').length,
      all: messages.length,
    }),
    [messages]
  )

  const handleSendNow = async (message: ScheduledMessageListItem) => {
    setBusyId(message.id)
    const result = await sendScheduledMessageNow(message.id)
    if (result.success) {
      toast.success(t('sentNow'))
      onChanged()
    } else {
      toast.error(result.error || t('sendError'))
    }
    setBusyId(null)
  }

  const handleCancel = async (message: ScheduledMessageListItem) => {
    setBusyId(message.id)
    const result = await cancelScheduledMessage(message.id)
    if (result.success) {
      toast.success(t('cancelled'))
      onChanged()
    } else {
      toast.error(result.error || t('cancelError'))
    }
    setBusyId(null)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setBusyId(deleteTarget.id)
    const result = await deleteScheduledMessage(deleteTarget.id)
    if (result.success) {
      toast.success(t('deleted'))
      onChanged()
    } else {
      toast.error(result.error || t('deleteError'))
    }
    setBusyId(null)
    setDeleteTarget(null)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        {STATUS_FILTERS.map((key) => (
          <Button
            key={key}
            size="sm"
            variant={filter === key ? 'default' : 'outline'}
            onClick={() => setFilter(key)}
          >
            {t(`filters.${key}`)}
            {counts[key] > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                {counts[key]}
              </Badge>
            )}
          </Button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-12 text-center">
            <CalendarClock className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('emptyHint')}</p>
          </div>
        ) : (
          <ul className="divide-y">
            {filtered.map((message) => {
              const Icon = CHANNEL_ICONS[message.channel as MessageChannel] ?? Send
              const isBusy = busyId === message.id
              const isOpen = message.status === 'scheduled'
              return (
                <li key={message.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40">
                  <div
                    className={cn(
                      'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      message.status === 'failed' ? 'bg-red-500/10' : 'bg-sky-500/10'
                    )}
                  >
                    <Icon
                      className={cn(
                        'h-4 w-4',
                        message.status === 'failed' ? 'text-red-600' : 'text-sky-600'
                      )}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {message.subject?.trim() || message.body.slice(0, 60)}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn('text-[10px] px-1.5 py-0', statusBadgeClass(message.status))}
                      >
                        {t(`status.${message.status}`)}
                      </Badge>
                      {message.frequency !== 'once' && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          <Repeat className="mr-1 h-2.5 w-2.5" />
                          {td(`frequencies.${message.frequency}`)}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{message.body}</p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {formatDate(message.sendAt)} · {formatTime(message.sendAt)}
                      </span>
                      <span>{td(`channels.${message.channel}`)}</span>
                      <span className="truncate">
                        {message.customer?.name || message.recipient || t('noRecipient')}
                      </span>
                      {message.runCount > 0 && (
                        <span>{t('sentCount', { count: message.runCount })}</span>
                      )}
                    </div>

                    {message.errorMessage && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-red-600">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {message.errorMessage}
                      </p>
                    )}
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        disabled={isBusy}
                        aria-label={t('rowMenu')}
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MoreVertical className="h-4 w-4" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {isOpen && (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(message)
                              setShowDialog(true)
                            }}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            {tc('edit')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSendNow(message)}>
                            <Send className="mr-2 h-4 w-4" />
                            {t('sendNow')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleCancel(message)}>
                            <XCircle className="mr-2 h-4 w-4" />
                            {t('cancel')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setDeleteTarget(message)}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {tc('delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ScheduleMessageDialog
        open={showDialog}
        onOpenChange={(open) => {
          setShowDialog(open)
          if (!open) setEditing(undefined)
        }}
        availableChannels={availableChannels}
        message={editing}
        onSaved={onChanged}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tc('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
