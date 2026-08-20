'use server'

import { db } from '@/lib/db'
import { withAuth } from '@/lib/with-auth'
import { SETTING_KEYS } from '../Schema/settingsSchema'

/** Reads the ids the workshop has already been shown. */
export function parseSeenHints(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    // Hand-edited, or written by something older. An unreadable list means
    // nothing has been seen, which shows a hint again at worst.
    return []
  }
}

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

    const existing = await db.appSetting.findUnique({
      where: {
        organizationId_key: { organizationId, key: SETTING_KEYS.FEATURE_HINTS_SEEN },
      },
      select: { value: true },
    })

    const seen = parseSeenHints(existing?.value)
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
