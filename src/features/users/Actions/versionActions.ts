'use server'

import { db } from '@/lib/db'
import { getCachedSession } from '@/lib/cached-session'

/**
 * Records that the current user has seen (or dismissed) the update banner for
 * the given app version. Stored per user, so the banner shows exactly once per
 * account per release across all devices. Deliberately session-scoped rather
 * than org-scoped: the version is a property of the deployment, not the org.
 */
export async function markVersionSeen(version: string) {
  const session = await getCachedSession()
  if (!session?.user?.id) return { success: false }

  const clean = version.slice(0, 64)
  if (!clean) return { success: false }

  await db.user.update({
    where: { id: session.user.id },
    data: { lastSeenVersion: clean },
  })
  return { success: true }
}

/**
 * Records when the update banner for this release first appeared to the
 * current user. Only the first sighting counts: a second device, or a reload,
 * finds the version already stamped and leaves the clock where it is. That is
 * what makes the hour run once per person rather than once per tab.
 */
export async function markUpdateBannerShown(version: string) {
  const session = await getCachedSession()
  if (!session?.user?.id) return { success: false }

  const clean = version.slice(0, 64)
  if (!clean) return { success: false }

  await db.user.updateMany({
    where: { id: session.user.id, NOT: { updateBannerVersion: clean } },
    data: { updateBannerVersion: clean, updateBannerShownAt: new Date() },
  })
  return { success: true }
}
