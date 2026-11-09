import 'server-only'
import { db } from '@/lib/db'

/**
 * Read and write the workshop calendar's settings rows. A setting row names
 * the user who wrote it; a scheduled refresh has none, so it writes as an
 * owner of the workshop, as other automated writes do.
 */

export async function readSettings(
  organizationId: string,
  keys: readonly string[]
): Promise<Map<string, string>> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: [...keys] } },
    select: { key: true, value: true },
  })
  return new Map(rows.map((r) => [r.key, r.value]))
}

/** Who an automated write is recorded as: an owner of the workshop. */
export async function ownerOf(organizationId: string): Promise<string> {
  const owner = await db.organizationMember.findFirst({
    where: { organizationId, role: 'owner' },
    select: { userId: true },
  })
  return owner?.userId ?? ''
}

export async function writeSetting(
  organizationId: string,
  key: string,
  value: string,
  userId?: string
): Promise<void> {
  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    create: { organizationId, key, value, userId: userId || (await ownerOf(organizationId)) },
    update: { value },
  })
}
