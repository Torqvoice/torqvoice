import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { isDemoMode } from '@/lib/demo'
import {
  dispatchScheduledMessage,
  nextSendAt,
} from '@/features/scheduled-messages/Lib/dispatchScheduledMessage'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { frozenOrganizationIds, isRestoring } from '@/lib/backup/freeze'
import { createLogger } from '@/lib/logger'
import { createTickSummary } from './tick-summary'

const log = createLogger('scheduled-messages')

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

  // A workshop being restored is left out of the query, so its messages
  // cannot fill the batch; the next tick after the restore sends them.
  const frozen = frozenOrganizationIds()
  const due = await db.scheduledMessage.findMany({
    where: {
      status: 'scheduled',
      sendAt: { lte: now },
      ...(frozen.length ? { organizationId: { notIn: frozen } } : {}),
    },
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
  // One settings read per workshop, however many of its messages are due
  const zones = new Map<string, string>()

  for (const message of due) {
    // A restore that started after the query: left as it is for a tick after.
    if (isRestoring(message.organizationId)) continue
    const isStale = now.getTime() - message.sendAt.getTime() > MAX_LATENESS_MS
    let timeZone = zones.get(message.organizationId)
    if (!timeZone) {
      timeZone = await workshopTimeZone(message.organizationId)
      zones.set(message.organizationId, timeZone)
    }
    const following = nextSendAt(message.sendAt, message.frequency, message.endDate, timeZone)

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
      log.warn('Skipped a stale message', {
        organizationId: message.organizationId,
        messageId: message.id,
      })
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
      log.error('Send failed', {
        organizationId: message.organizationId,
        messageId: message.id,
        error: errorMessage,
      })
    }
  }

  return sent
}

/** Minute-by-minute scan, so a message goes out on the minute it was set for. */
export function processScheduledMessages() {
  const summary = createTickSummary('Scheduled messages sent')
  const job = new CronJob('* * * * *', async () => {
    try {
      summary.add(await processDueMessages())
    } catch (error) {
      log.error('Scan failed', { err: error })
    }
  })
  job.start()
  log.info('Scheduled-message processor started (every minute)')
}
