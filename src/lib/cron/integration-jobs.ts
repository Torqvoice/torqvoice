import { CronJob } from 'cron'
import { createLogger } from '@/lib/logger'
import { createTickSummary } from './tick-summary'
import {
  cleanupIntegrationHistory,
  recoverStuckJobs,
  runDueJobs,
  scheduleDueSyncs,
} from '@/features/integrations/Lib/jobs'

const log = createLogger('cron')

/**
 * Integration job runner, every minute: put back anything a crashed worker
 * left running, queue the timed syncs that are due, then run due jobs.
 */
export function processIntegrationJobs() {
  const summary = createTickSummary('Integration jobs processed')
  const job = new CronJob('* * * * *', async () => {
    try {
      const recovered = await recoverStuckJobs()
      if (recovered > 0) log.warn('Recovered stuck integration jobs', { count: recovered })
      await scheduleDueSyncs()
      summary.add(await runDueJobs(50))
    } catch (err) {
      log.error('Integration job runner failed', { err })
    }
  })
  job.start()
  log.info('Integration job runner started (every minute)')
}

/** Daily at 03:40 UTC: logs older than 30 days, finished jobs older than 7. */
export function cleanupIntegrationLogs() {
  const job = new CronJob('40 3 * * *', async () => {
    try {
      const result = await cleanupIntegrationHistory()
      if (result.jobs || result.logs) {
        log.info('Integration cleanup', { jobs: result.jobs, logLines: result.logs })
      }
    } catch (err) {
      log.error('Integration cleanup failed', { err })
    }
  })
  job.start()
}
