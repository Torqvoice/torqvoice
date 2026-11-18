import { CronJob } from 'cron'
import { db } from '@/lib/db'
import { createLogger } from '@/lib/logger'

/** Deletes expired portal sessions and used magic links daily at 02:00 UTC */
export function cleanupPortalSessions() {
  const job = new CronJob('0 2 * * *', async () => {
    try {
      const now = new Date()

      const [deletedSessions, deletedLinks] = await Promise.all([
        db.customerSession.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        db.customerMagicLink.deleteMany({
          where: {
            OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
          },
        }),
      ])

      if (deletedSessions.count > 0 || deletedLinks.count > 0) {
        createLogger('cron').info('Portal session cleanup', {
          sessions: deletedSessions.count,
          magicLinks: deletedLinks.count,
        })
      }
    } catch (error) {
      createLogger('cron').error('Portal session cleanup failed', { err: error })
    }
  })

  job.start()
}
