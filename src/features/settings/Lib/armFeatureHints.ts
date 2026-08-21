import type { Prisma } from '@/generated/prisma/client'
import { db as prisma } from '@/lib/db'
import { SETTING_KEYS } from '../Schema/settingsSchema'
import { HINT_FOR_SETTING, hintsToArm, parseHintIds } from './featureHints'

type Db = Prisma.TransactionClient | typeof prisma

/**
 * Raises the hints for any setting this write is switching on.
 *
 * Call it before the write, while the old values are still readable. Every
 * path that saves settings goes through here, including the ones that write
 * their own transaction, so a new toggle only has to add a line to
 * HINT_FOR_SETTING to get its link pointed out.
 *
 * Deliberately does its own small write rather than joining the caller's
 * transaction. If the settings write then fails, the workshop is left with a
 * hint armed for a link that did not appear, and an armed hint with nothing
 * rendering it is inert: the card only exists where the link does.
 */
export async function armFeatureHints(
  db: Db,
  organizationId: string,
  userId: string,
  entries: Record<string, string>
): Promise<void> {
  // Cheap exit for the overwhelming majority of saves, which touch no
  // hint-bearing setting at all.
  const watched = Object.keys(entries).filter((key) => key in HINT_FOR_SETTING)
  if (watched.length === 0) return

  const rows = await db.appSetting.findMany({
    where: {
      organizationId,
      key: {
        in: [...watched, SETTING_KEYS.FEATURE_HINTS_SEEN, SETTING_KEYS.FEATURE_HINTS_PENDING],
      },
    },
    select: { key: true, value: true },
  })
  const stored = new Map(rows.map((row) => [row.key, row.value]))

  const armed = hintsToArm({
    entries,
    current: Object.fromEntries(watched.map((key) => [key, stored.get(key)])),
    seen: parseHintIds(stored.get(SETTING_KEYS.FEATURE_HINTS_SEEN)),
  })
  if (armed.length === 0) return

  const pending = parseHintIds(stored.get(SETTING_KEYS.FEATURE_HINTS_PENDING))
  const next = [...pending, ...armed.filter((id) => !pending.includes(id))]
  if (next.length === pending.length) return

  await db.appSetting.upsert({
    where: {
      organizationId_key: { organizationId, key: SETTING_KEYS.FEATURE_HINTS_PENDING },
    },
    create: {
      userId,
      organizationId,
      key: SETTING_KEYS.FEATURE_HINTS_PENDING,
      value: JSON.stringify(next),
    },
    update: { value: JSON.stringify(next) },
  })
}
