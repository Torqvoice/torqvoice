'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'

/**
 * Records that this person has opened the "What's new" panel.
 *
 * On the user record, like the update banner's version: the news is about the
 * product, not about one workshop, so somebody in two workshops reads it once,
 * and opening the panel on the office computer clears the dot on their phone.
 */
export async function markWhatsNewSeen() {
  return withAuth(
    async ({ userId }) => {
      await db.user.update({ where: { id: userId }, data: { whatsNewSeenAt: new Date() } })
      return { seen: true }
    },
    // Reading the news writes nothing to the workshop a restore is replacing.
    { allowDuringRestore: true }
  )
}
