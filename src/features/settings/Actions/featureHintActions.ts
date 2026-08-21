'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { SETTING_KEYS } from '../Schema/settingsSchema'
import { parseHintIds } from '../Lib/featureHints'

/**
 * Marks a feature hint as shown, for the whole workshop.
 *
 * Not gated on a permission subject. Anyone who can open the app can close a
 * note telling them where something is, and requiring settings rights would
 * leave a technician looking at a card they cannot dismiss.
 *
 * Appends rather than replaces, so two people dismissing different hints at
 * the same time cannot erase each other's.
 */
export async function dismissFeatureHint(id: string) {
  return withAuth(async ({ organizationId, userId }) => {
    const trimmed = id.trim().slice(0, 100)
    if (!trimmed) return { seen: [] as string[] }

    const rows = await db.appSetting.findMany({
      where: {
        organizationId,
        key: { in: [SETTING_KEYS.FEATURE_HINTS_SEEN, SETTING_KEYS.FEATURE_HINTS_PENDING] },
      },
      select: { key: true, value: true },
    })
    const stored = new Map(rows.map((row) => [row.key, row.value]))

    // Taken off the pending list as well as added to the seen one. Leaving it
    // pending would cost nothing today, but a later hint bumped to .v2 would
    // find a stale .v1 sitting in front of it in the queue forever.
    const pending = parseHintIds(stored.get(SETTING_KEYS.FEATURE_HINTS_PENDING))
    if (pending.includes(trimmed)) {
      await db.appSetting.update({
        where: {
          organizationId_key: { organizationId, key: SETTING_KEYS.FEATURE_HINTS_PENDING },
        },
        data: { value: JSON.stringify(pending.filter((id) => id !== trimmed)) },
      })
    }

    const seen = parseHintIds(stored.get(SETTING_KEYS.FEATURE_HINTS_SEEN))
    if (seen.includes(trimmed)) return { seen }

    // Capped so a long-lived workshop cannot grow this without bound. The
    // oldest hints are the ones nobody will ever be shown again anyway.
    const next = [...seen, trimmed].slice(-200)

    await db.appSetting.upsert({
      where: {
        organizationId_key: { organizationId, key: SETTING_KEYS.FEATURE_HINTS_SEEN },
      },
      create: {
        userId,
        organizationId,
        key: SETTING_KEYS.FEATURE_HINTS_SEEN,
        value: JSON.stringify(next),
      },
      update: { value: JSON.stringify(next) },
    })

    return { seen: next }
  })
}
