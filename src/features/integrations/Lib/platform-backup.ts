import { z } from 'zod'
import { canRestoreBackups, backupOffsetMinutes, runView } from '@/features/integrations/Lib/backup'
import type {
  PlatformBackupOverview,
  PlatformSnapshotView,
} from '@/features/integrations/Lib/backup-types'
import { PAUSED_GRACE_MS, platformBackupAllowed, platformBackupConfig } from '@/lib/backup/platform'
import { BACKUP_SETTING_DEFAULTS, nextRunAfter } from '@/lib/backup/schedule'
import { db } from '@/lib/db'
import { getFeatures } from '@/lib/features'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import { platformBackupFrequency } from '@/lib/cron/backup-runs'

/**
 * What the Backups by Torqvoice card on Settings, Data shows: where the
 * schedule stands, the restore points in the repository (stored after each
 * run, so the page never opens the repository), and the last runs. Null on a
 * server without platform backups, where the card does not exist.
 */

const snapshotSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{8,64}$/),
  shortId: z.string(),
  time: z.string(),
  bytes: z.number().nullable(),
  trigger: z.enum(['scheduled', 'manual']).nullable(),
  preRestore: z.boolean(),
})

/** The stored restore points, dropping anything that is not one. */
export function parseSnapshots(raw: unknown): PlatformSnapshotView[] {
  if (!Array.isArray(raw)) return []
  const out: PlatformSnapshotView[] = []
  for (const item of raw) {
    const parsed = snapshotSchema.safeParse(item)
    if (parsed.success) out.push(parsed.data)
  }
  return out
}

/** When the paused repository will be forgotten, or null when not paused. */
export function purgeDueAt(pausedAt: Date | null): Date | null {
  return pausedAt ? new Date(pausedAt.getTime() + PAUSED_GRACE_MS) : null
}

export async function platformBackupOverview(
  organizationId: string,
  viewer: { userId: string; isAdmin: boolean }
): Promise<PlatformBackupOverview | null> {
  if (!platformBackupConfig()) return null
  const [features, row, recentRows, organization] = await Promise.all([
    getFeatures(organizationId),
    db.platformBackup.findUnique({ where: { organizationId } }),
    db.backupRun.findMany({
      where: { organizationId, kind: 'platform' },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    db.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
  ])
  const active = platformBackupAllowed(features)
  const open = recentRows.find((r) => r.status === 'queued' || r.status === 'running')
  let queuedAhead = 0
  if (open?.status === 'queued') {
    queuedAhead = await db.backupRun.count({
      where: { status: { in: ['queued', 'running'] }, createdAt: { lt: open.createdAt } },
    })
  }
  let nextRunAt: string | null = null
  if (active) {
    const frequency = await platformBackupFrequency()
    const settings = { ...BACKUP_SETTING_DEFAULTS, frequency, time: '02:00' }
    const timeZone = await workshopTimeZone(organizationId)
    nextRunAt = nextRunAfter(
      settings,
      row?.lastScheduledAt ?? new Date(),
      timeZone,
      backupOffsetMinutes(organizationId)
    ).toISOString()
  }
  const canRestore =
    active &&
    (await canRestoreBackups({ userId: viewer.userId, organizationId, isAdmin: viewer.isAdmin }))
  return {
    active,
    paused: !active && Boolean(row?.pausedAt) && !row?.purgedAt,
    purgeDueAt: !active ? (purgeDueAt(row?.pausedAt ?? null)?.toISOString() ?? null) : null,
    lastGoodAt: row?.lastGoodAt?.toISOString() ?? null,
    nextRunAt,
    repositorySize:
      row?.repositorySize === null || row?.repositorySize === undefined
        ? null
        : Number(row.repositorySize),
    snapshots: row?.purgedAt ? [] : parseSnapshots(row?.snapshots),
    recent: recentRows.map(runView),
    running: Boolean(open),
    restoring: open?.trigger === 'restore',
    queuedAhead,
    canRestore,
    workshopName: organization?.name ?? '',
  }
}

/** Whether a snapshot id is one of the workshop's stored restore points. */
export async function isKnownPlatformSnapshot(
  organizationId: string,
  snapshotId: string
): Promise<boolean> {
  const row = await db.platformBackup.findUnique({
    where: { organizationId },
    select: { snapshots: true, purgedAt: true },
  })
  if (!row || row.purgedAt) return false
  return parseSnapshots(row.snapshots).some((s) => s.id === snapshotId)
}
