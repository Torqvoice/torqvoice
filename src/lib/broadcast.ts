import { cache } from 'react'
import { db } from '@/lib/db'
import {
  BROADCAST_LEVELS,
  BROADCAST_MAX_LENGTH,
  SYSTEM_SETTING_KEYS,
  type BroadcastLevel,
} from '@/features/admin/Schema/systemSettingsSchema'

/**
 * Pages a workshop's own customers see, where a platform notice must not go.
 *
 * Deliberately its own list rather than reuse of the locale helper, which
 * matches on an org id and so lets bare `/portal` and `/terms` through. This
 * one is a promise to every workshop, and it is a prefix check on purpose:
 * anything added under these roots is covered without anyone remembering to
 * come back here.
 *
 * Two reasons it matters. These pages carry the workshop's branding, not ours,
 * and a white-label licence exists precisely so Torqvoice does not appear on
 * that paperwork. And a notice aimed at staff, about maintenance or an
 * incident, is not something a customer opening an invoice should read.
 */
const CUSTOMER_FACING = ['/portal', '/share', '/terms']

export function isCustomerFacingPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false
  return CUSTOMER_FACING.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

export type Broadcast = {
  message: string
  level: BroadcastLevel
  /** Changes whenever the notice does, which is what resets dismissals. */
  updatedAt: string
}

/**
 * The notice every visitor sees, if there is one.
 *
 * Read without authentication on purpose. An infrastructure incident is worth
 * saying on the sign-in page too, and someone who cannot get in is exactly the
 * person who most needs to know why.
 *
 * Cached per request: this runs in the root layout, so it is on the path of
 * every page in the app, and it must stay a single indexed lookup that returns
 * nothing almost every time.
 */
export const getBroadcast = cache(async (): Promise<Broadcast | null> => {
  let rows: { key: string; value: string }[]
  try {
    rows = await db.systemSetting.findMany({
      where: {
        key: {
          in: [
            SYSTEM_SETTING_KEYS.BROADCAST_MESSAGE,
            SYSTEM_SETTING_KEYS.BROADCAST_LEVEL,
            SYSTEM_SETTING_KEYS.BROADCAST_UPDATED_AT,
          ],
        },
      },
      select: { key: true, value: true },
    })
  } catch {
    // The banner sits in the root layout, so a database that is down or not
    // yet migrated must not take every page down with it. No notice is the
    // right answer when we cannot read one.
    return null
  }

  const stored = new Map(rows.map((row) => [row.key, row.value]))
  const message = stored.get(SYSTEM_SETTING_KEYS.BROADCAST_MESSAGE)?.trim()
  if (!message) return null

  const level = stored.get(SYSTEM_SETTING_KEYS.BROADCAST_LEVEL) as BroadcastLevel | undefined

  return {
    message: message.slice(0, BROADCAST_MAX_LENGTH),
    level: level && BROADCAST_LEVELS.includes(level) ? level : 'info',
    // Falling back to the text itself still gives dismissals something stable
    // to key on, for a notice written before the timestamp existed.
    updatedAt: stored.get(SYSTEM_SETTING_KEYS.BROADCAST_UPDATED_AT) ?? message,
  }
})
