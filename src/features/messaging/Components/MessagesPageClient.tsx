'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarClock, Inbox } from 'lucide-react'
import { ScheduledMessageList } from '@/features/scheduled-messages/Components/ScheduledMessageList'
import { ScheduleMessageDialog } from '@/features/scheduled-messages/Components/ScheduleMessageDialog'
import {
  getScheduledMessages,
  type ScheduledMessageListItem,
} from '@/features/scheduled-messages/Actions/scheduledMessageActions'
import type { MessageChannel } from '@/features/scheduled-messages/Schema/scheduledMessageSchema'
import type { InboxThread, MessagingChannel } from '../Actions/inboxActions'
import { UnifiedInbox } from './UnifiedInbox'

/**
 * The Messages page: one inbox across every channel, and the scheduled queue.
 *
 * This used to be the SMS inbox with everything else bolted beside it. The
 * conversations themselves now live in UnifiedInbox, which leaves this as what
 * it always described itself as: the page's two halves and the frame they sit
 * in.
 */
type Tab = 'inbox' | 'scheduled'

export function MessagesPageClient({
  threads,
  initialCursor = null,
  channels,
  initialScheduled = [],
  availableChannels = [],
}: {
  threads: InboxThread[]
  /** Where the inbox's next page starts. */
  initialCursor?: string | null
  /** Channels with a working provider, for the composer. */
  channels: MessagingChannel[]
  initialScheduled?: ScheduledMessageListItem[]
  availableChannels?: MessageChannel[]
}) {
  const t = useTranslations('messaging.inbox')
  const tp = useTranslations('messages.page')
  const ts = useTranslations('scheduledMessages.list')
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startRefresh] = useTransition()

  const [scheduled, setScheduled] = useState(initialScheduled)
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)

  const tab: Tab = searchParams.get('tab') === 'scheduled' ? 'scheduled' : 'inbox'

  /** The tab lives in the URL, so the queue and the inbox can be linked to. */
  const setTab = useCallback(
    (next: Tab) => {
      const params = new URLSearchParams(searchParams.toString())
      if (next === 'inbox') params.delete('tab')
      else params.set('tab', next)
      const query = params.toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  const refreshScheduled = useCallback(async () => {
    const result = await getScheduledMessages()
    if (result.success && result.data) setScheduled(result.data)
  }, [])

  const upcomingCount = scheduled.filter((message) => message.status === 'scheduled').length

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border p-1">
          <Button
            size="sm"
            variant={tab === 'inbox' ? 'default' : 'ghost'}
            className="h-8"
            onClick={() => setTab('inbox')}
          >
            <Inbox className="mr-1.5 h-3.5 w-3.5" />
            {tp('tabs.inbox')}
          </Button>
          <Button
            size="sm"
            variant={tab === 'scheduled' ? 'default' : 'ghost'}
            className="h-8"
            onClick={() => setTab('scheduled')}
          >
            <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
            {tp('tabs.scheduled')}
            {upcomingCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 px-1 text-xs">
                {upcomingCount}
              </Badge>
            )}
          </Button>
        </div>

        <Button size="sm" variant="outline" onClick={() => setShowScheduleDialog(true)}>
          <CalendarClock className="mr-1 h-3.5 w-3.5" />
          {ts('scheduleMessage')}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border bg-background">
        {tab === 'scheduled' ? (
          <div className="min-w-0 flex-1">
            <ScheduledMessageList
              messages={scheduled}
              availableChannels={availableChannels}
              onChanged={refreshScheduled}
            />
          </div>
        ) : channels.length === 0 && threads.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
            <Inbox className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium">{t('noChannelsTitle')}</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{t('noChannelsHint')}</p>
            <Button size="sm" variant="outline" className="mt-4" asChild>
              <a href="/settings/providers">{t('goToProviders')}</a>
            </Button>
          </div>
        ) : (
          <UnifiedInbox
            threads={threads}
            initialCursor={initialCursor}
            channels={channels}
            onChanged={() => startRefresh(() => router.refresh())}
          />
        )}
      </div>

      <ScheduleMessageDialog
        open={showScheduleDialog}
        onOpenChange={setShowScheduleDialog}
        availableChannels={availableChannels}
        onSaved={() => {
          refreshScheduled()
          setTab('scheduled')
        }}
      />
    </div>
  )
}
