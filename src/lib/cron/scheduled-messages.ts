import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import {
  dispatchScheduledMessage,
  nextSendAt,
} from '@/features/scheduled-messages/Lib/dispatchScheduledMessage'

const LOG_PREFIX = '[scheduled-messages]'

/** Nothing older than this is sent on a late start; it is marked failed instead. */
const MAX_LATENESS_MS = 24 * 60 * 60 * 1000

/**
 * Send everything whose time has come.
 *
 * Each message is isolated: one broken address must not hold up the rest of
 * the queue. A repeating message rolls forward to its next slot whether the
 * send worked or not, so a single failure doesn't stop the series.
 */
export async function processDueMessages(now = new Date()): Promise<number> {
  // The demo's seeded queue is scenery, not a work list. The transports refuse
  // to send in demo mode anyway; stopping here keeps the queue looking alive
  // instead of turning every seeded message red a minute after each reset.
  if (isDemoMode) return 0

  const due = await db.scheduledMessage.findMany({
    where: { status: 'scheduled', sendAt: { lte: now } },
    select: {
      id: true,
      channel: true,
      subject: true,
      body: true,
      recipient: true,
      organizationId: true,
      customerId: true,
      vehicleId: true,
      sendAt: true,
      frequency: true,
      endDate: true,
      runCount: true,
    },
    orderBy: { sendAt: 'asc' },
    take: 200,
  })

  let sent = 0

  for (const message of due) {
    const isStale = now.getTime() - message.sendAt.getTime() > MAX_LATENESS_MS
    const following = nextSendAt(message.sendAt, message.frequency, message.endDate)

    if (isStale) {
      // A day late is no longer the message the workshop meant to send, so it
      // is recorded as missed rather than delivered out of context.
      await db.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: following ? 'scheduled' : 'failed',
          sendAt: following ?? message.sendAt,
          lastRunAt: now,
          errorMessage: 'Missed its send window and was skipped',
        },
      })
      console.warn(`${LOG_PREFIX} skipped stale message ${message.id}`)
      continue
    }

    try {
      await dispatchScheduledMessage(message)
      await db.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: following ? 'scheduled' : 'sent',
          sendAt: following ?? message.sendAt,
          sentAt: now,
          lastRunAt: now,
          runCount: message.runCount + 1,
          errorMessage: null,
        },
      })
      sent++
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      await db.scheduledMessage.update({
        where: { id: message.id },
        data: {
          status: following ? 'scheduled' : 'failed',
          sendAt: following ?? message.sendAt,
          lastRunAt: now,
          runCount: message.runCount + 1,
          errorMessage,
        },
      })
      console.error(`${LOG_PREFIX} send failed for ${message.id}:`, errorMessage)
    }
  }

  return sent
}

/** Minute-by-minute scan, so a message goes out on the minute it was set for. */
export function processScheduledMessages() {
  const job = new CronJob('* * * * *', async () => {
    try {
      const sent = await processDueMessages()
      if (sent > 0) {
        console.warn(`${LOG_PREFIX} sent ${sent} scheduled message(s)`)
      }
    } catch (error) {
      console.error(`${LOG_PREFIX} scan failed:`, error)
    }
  })
  job.start()
  console.warn(`${LOG_PREFIX} Scheduled-message processor started (every minute)`)
}
