import 'server-only'

// Not a server action: it is called by the two cleanup routes, which check
// who is asking. As a 'use server' export anyone could call it, unsigned.

import { db } from '@/lib/db'
import { releaseFiles } from '@/lib/files/manager'

/**
 * Deletes expired status reports and their associated video files.
 * Called by the cleanup cron API route.
 */
export async function cleanupExpiredReports() {
  const now = new Date()

  // Find all expired reports with video files
  const expiredReports = await db.statusReport.findMany({
    where: {
      expiresAt: { lt: now },
    },
    select: {
      id: true,
      videoUrl: true,
      organizationId: true,
    },
  })

  if (expiredReports.length === 0) return { deleted: 0 }

  // Exactly the reports read above, so the videos let go below are theirs.
  const result = await db.statusReport.deleteMany({
    where: { id: { in: expiredReports.map((report) => report.id) } },
  })

  // Their videos, per workshop, once the reports are gone.
  const byOrganization = new Map<string, (string | null)[]>()
  for (const report of expiredReports) {
    const urls = byOrganization.get(report.organizationId) ?? []
    urls.push(report.videoUrl)
    byOrganization.set(report.organizationId, urls)
  }
  for (const [organizationId, urls] of byOrganization) {
    await releaseFiles(urls, { organizationId, reason: 'status report expired' })
  }

  return { deleted: result.count }
}
