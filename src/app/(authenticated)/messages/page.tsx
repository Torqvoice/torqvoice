import { Suspense } from 'react'
import { getAuthContext } from '@/lib/get-auth-context'
import { redirect } from 'next/navigation'
import { getScheduledMessages } from '@/features/scheduled-messages/Actions/scheduledMessageActions'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import { getInboxThreads, type InboxPage } from '@/features/messaging/Actions/inboxActions'
import { MessagesPageClient } from '@/features/messaging/Components/MessagesPageClient'
import { PageHeader } from '@/components/page-header'

export default async function MessagesPage() {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/sign-in')

  // One inbox for every channel, so the page loads them together rather than
  // asking which one the workshop meant.
  const [inboxResult, scheduledResult, messageChannels] = await Promise.all([
    getInboxThreads(),
    getScheduledMessages(),
    getAvailableChannels(ctx.organizationId),
  ])

  const inbox: InboxPage =
    inboxResult.success && inboxResult.data
      ? inboxResult.data
      : { threads: [], nextCursor: null, channels: [] }
  const scheduled = scheduledResult.success && scheduledResult.data ? scheduledResult.data : []

  return (
    // The inbox is a full-height pane with its own scrolling regions, so the
    // page is bounded by the viewport rather than growing the document.
    <div className="flex h-svh flex-col overflow-hidden">
      <PageHeader />
      <div className="flex min-h-0 flex-1 flex-col p-4 pt-0">
        <Suspense>
          <MessagesPageClient
            threads={inbox.threads}
            initialCursor={inbox.nextCursor}
            channels={inbox.channels}
            initialScheduled={scheduled}
            availableChannels={messageChannels}
          />
        </Suspense>
      </div>
    </div>
  )
}
