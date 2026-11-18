import { CronJob } from 'cron'
import { recordBackgroundJobsBeat } from '@/lib/background-jobs'

/**
 * A beat every minute on the same scheduler as the real jobs, so the health
 * check can tell they are still firing. Started after every other job, so a
 * start that failed part way never beats at all.
 */
export function startHeartbeat() {
  recordBackgroundJobsBeat()
  const job = new CronJob('* * * * *', () => recordBackgroundJobsBeat())
  job.start()
  return job
}
