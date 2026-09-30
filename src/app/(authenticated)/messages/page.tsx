import { Suspense } from 'react'
import { getAuthContext } from '@/lib/get-auth-context'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { getScheduledMessages } from '@/features/scheduled-messages/Actions/scheduledMessageActions'
import { getAvailableChannels } from '@/features/scheduled-messages/Lib/availableChannels'
import {
  getInboxThreads,
  type InboxPage,
  type MessagingChannel,
} from '@/features/messaging/Actions/inboxActions'
import { MessagesPageClient } from '@/features/messaging/Components/MessagesPageClient'
import type { InboxFocus } from '@/features/messaging/Components/UnifiedInbox'
import { PageHeader } from '@/components/page-header'
import { listInspectionReminderCampaigns } from '@/features/inspection-reminders/Actions/inspectionReminderActions'

const CHANNELS: MessagingChannel[] = ['sms', 'whatsapp', 'telegram']

type SearchParams = Record<string, string | string[] | undefined>

function param(sp: SearchParams, key: string): string | null {
  const value = sp[key]
  return typeof value === 'string' && value ? value : null
}

/**
 * The conversation a link names. Notifications carry `customerId`, with the
 * channel as `channel` or, in links already stored, as `tab=telegram` or
 * `tab=whatsapp`; a WhatsApp message from a number with no customer carries
 * `contact`. The customer is read here, inside the workshop, so a link to
 * someone else's customer opens nothing.
 */
async function resolveFocus(sp: SearchParams, organizationId: string): Promise<InboxFocus | null> {
  const named = param(sp, 'channel') ?? param(sp, 'tab')
  const channel = CHANNELS.find((c) => c === named) ?? 'sms'
  const customerId = param(sp, 'customerId')
  const contact = param(sp, 'contact')

  if (customerId) {
    const customer = await db.customer.findFirst({
      where: { id: customerId, organizationId },
      select: { id: true, name: true, phone: true },
    })
    if (!customer) return null
    return { channel, customerId: customer.id, name: customer.name, contact: customer.phone ?? '' }
  }
  if (contact && channel === 'whatsapp') {
    return { channel, customerId: null, name: contact, contact }
  }
  return null
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const ctx = await getAuthContext()
  if (!ctx) redirect('/auth/sign-in')
  const sp = await searchParams

  // One inbox for every channel, so the page loads them together rather than
  // asking which one the workshop meant.
  const [inboxResult, scheduledResult, messageChannels, campaignsResult, focus] = await Promise.all(
    [
      getInboxThreads(),
      getScheduledMessages(),
      getAvailableChannels(ctx.organizationId),
      listInspectionReminderCampaigns(),
      resolveFocus(sp, ctx.organizationId),
    ]
  )

  const inbox: InboxPage =
    inboxResult.success && inboxResult.data
      ? inboxResult.data
      : { threads: [], nextCursor: null, channels: [] }
  const scheduled = scheduledResult.success && scheduledResult.data ? scheduledResult.data : []
  const campaigns = campaignsResult.success && campaignsResult.data ? campaignsResult.data : []

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
            campaigns={campaigns}
            availableChannels={messageChannels}
            focus={focus}
          />
        </Suspense>
      </div>
    </div>
  )
}
