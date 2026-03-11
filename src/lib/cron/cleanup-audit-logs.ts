import { CronJob } from 'cron'
import { db } from '@/lib/db'

/**
 * Audit log retention cleanup — runs daily at 03:00 UTC.
 *
 * ISO 27001/27002 (A.8.15) requires a defined retention policy for audit logs.
 * Default retention: 365 days (1 year). Override with AUDIT_LOG_RETENTION_DAYS env var.
 * ISO recommends minimum 1 year; many organizations retain for 2-3 years.
 */
export function cleanupAuditLogs() {
  const job = new CronJob('0 3 * * *', async () => {
    try {
      const retentionDays = parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '365', 10)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - retentionDays)

      const result = await db.auditLog.deleteMany({
        where: { timestamp: { lt: cutoff } },
      })

      if (result.count > 0) {
        console.warn(`[cron] Audit log cleanup: deleted ${result.count} logs older than ${retentionDays} days`)
      }
    } catch (error) {
      console.error('[cron] Audit log cleanup failed:', error)
    }
  })

  job.start()
}
