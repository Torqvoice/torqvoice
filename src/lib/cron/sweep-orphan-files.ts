import { CronJob } from 'cron'
import { purgeTrash, sweepOrphanFiles, TRASH_DAYS } from '@/lib/files/manager'
import { createLogger } from '@/lib/logger'

const log = createLogger('cron')

/**
 * Uploaded files no row points at, once a day at 03:30 UTC: moved to the
 * trash, and whatever has been in the trash longer than TRASH_DAYS deleted
 * for good.
 *
 * They come from uploads whose second step never happened (a file is written,
 * then the page that should save its row is closed) and from deletes before
 * the file manager existed. The sweep only considers names the upload routes
 * generate, files older than a week, workshops this database has, and the
 * same reference lists every other deletion uses. It leaves alone a workshop
 * where an implausible share of the files look unused, and moves at most a
 * thousand files a night, oldest first (lib/files/manager.ts).
 */
export function sweepOrphanFilesDaily() {
  const job = new CronJob('30 3 * * *', async () => {
    try {
      const { checked, removed, refused, skipped, deferred } = await sweepOrphanFiles()
      if (refused) log.error('File sweep refused', { reason: refused })
      else if (removed > 0 || deferred > 0) {
        log.info('File sweep moved unused files to the trash', {
          removed,
          checked,
          deferred,
        })
      }
      if (skipped.length > 0) {
        log.error('File sweep left workshops alone, see above', { count: skipped.length })
      }
      const purged = await purgeTrash()
      if (purged > 0)
        log.info('File sweep deleted old trash days', { days: purged, olderThanDays: TRASH_DAYS })
    } catch (error) {
      log.error('File sweep failed', { err: error })
    }
  })
  job.start()
}
