import { CronJob } from 'cron'
import {
  cleanupIntegrationHistory,
  recoverStuckJobs,
  runDueJobs,
  scheduleDueSyncs,
} from '@/features/integrations/Lib/jobs'

/**
 * Integration job runner, every minute: put back anything a crashed worker
 * left running, queue the timed syncs that are due, then run due jobs.
 */
export function processIntegrationJobs() {
  const job = new CronJob('* * * * *', async () => {
    try {
      const recovered = await recoverStuckJobs()
      if (recovered > 0) console.warn(`[cron] Recovered ${recovered} stuck integration jobs`)
      await scheduleDueSyncs()
      const ran = await runDueJobs(50)
      if (ran > 0) console.warn(`[cron] Integration jobs processed: ${ran}`)
    } catch (err) {
      console.error('[cron] Integration job runner failed:', err)
    }
  })
  job.start()
  console.warn('[cron] Integration job runner started (every minute)')
}

/** Daily at 03:40 UTC: logs older than 30 days, finished jobs older than 7. */
export function cleanupIntegrationLogs() {
  const job = new CronJob('40 3 * * *', async () => {
    try {
      const result = await cleanupIntegrationHistory()
      if (result.jobs || result.logs) {
        console.warn(`[cron] Integration cleanup: ${result.jobs} jobs, ${result.logs} log lines`)
      }
    } catch (err) {
      console.error('[cron] Integration cleanup failed:', err)
    }
  })
  job.start()
}
