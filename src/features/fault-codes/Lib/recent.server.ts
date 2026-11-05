import 'server-only'
import { db } from '@/lib/db'

/**
 * The codes read lately in this workshop, newest first, each once, with the
 * meaning saved the last time it was added and how many times it was read.
 */
export async function recentCodes(
  organizationId: string,
  take = 12
): Promise<{ code: string; meaning: string | null; at: string; count: number }[]> {
  const rows = await db.vehicleFinding.findMany({
    where: { faultCode: { not: null }, vehicle: { organizationId } },
    select: { faultCode: true, faultMeaning: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  const out = new Map<string, { code: string; meaning: string | null; at: string; count: number }>()
  for (const row of rows) {
    if (!row.faultCode) continue
    const seen = out.get(row.faultCode)
    if (seen) {
      seen.count += 1
      continue
    }
    out.set(row.faultCode, {
      code: row.faultCode,
      meaning: row.faultMeaning,
      at: row.createdAt.toISOString(),
      count: 1,
    })
  }
  return [...out.values()].slice(0, take)
}
