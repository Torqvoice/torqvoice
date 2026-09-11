import { db } from '@/lib/db'

/** Prisma's code for a unique constraint the row already satisfies. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

/**
 * Write the setting that records an old setup as adopted, once.
 *
 * Prisma's upsert on a compound key is a select followed by an insert, so two
 * adoptions landing at once, such as a prefetch and the navigation it was
 * for, can both find no row and both insert. The loser's row is the same row
 * the winner wrote, so its unique violation is the marker being there already.
 */
export async function writeAdoptionMarker(
  organizationId: string,
  key: string,
  userId: string
): Promise<void> {
  try {
    await db.appSetting.upsert({
      where: { organizationId_key: { organizationId, key } },
      create: { organizationId, userId, key, value: new Date().toISOString() },
      update: {},
    })
  } catch (err) {
    if (!isUniqueViolation(err)) throw err
  }
}
