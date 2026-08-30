import { NextRequest, NextResponse } from 'next/server'
import { createHash, timingSafeEqual } from 'crypto'
import { db } from '@/lib/db'
import { BACKUP_HEARTBEAT_KEY } from '@/lib/backup-heartbeat'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Called by the off-app backup job after each successful offsite push, so the
 * settings UI can show organizations how fresh the latest backup is. Not tied
 * to any organization: the backup covers the whole installation, so a single
 * system-wide timestamp is the truthful representation.
 *
 * Auth is a static bearer token (BACKUP_HEARTBEAT_TOKEN). When the env var is
 * absent the endpoint plays dead with a 404, so installations that never
 * configure it (e.g. self-hosted without the backup job) expose nothing.
 */
export async function POST(request: NextRequest) {
  const expected = process.env.BACKUP_HEARTBEAT_TOKEN
  if (!expected) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  // Hashing both sides gives equal-length buffers, which timingSafeEqual requires.
  const providedHash = createHash('sha256').update(provided).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  if (!timingSafeEqual(providedHash, expectedHash)) {
    // Only failed auth is rate limited. The bucket key (X-Forwarded-For) is
    // spoofable, so limiting before auth would let strangers fill the real
    // backup job's bucket and block the legitimate hourly heartbeat.
    const limited = rateLimit(request, { limit: 5, windowMs: 60_000 })
    if (limited) return limited
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let snapshotId: string | null = null
  try {
    const body = await request.json()
    if (typeof body?.snapshotId === 'string' && body.snapshotId.length <= 64) {
      snapshotId = body.snapshotId
    }
  } catch {
    // Body is optional; the timestamp is the payload that matters.
  }

  const value = JSON.stringify({ at: new Date().toISOString(), snapshotId })
  await db.systemSetting.upsert({
    where: { key: BACKUP_HEARTBEAT_KEY },
    create: { key: BACKUP_HEARTBEAT_KEY, value },
    update: { value },
  })

  return new NextResponse(null, { status: 204 })
}
