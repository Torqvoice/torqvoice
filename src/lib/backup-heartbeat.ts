import { db } from '@/lib/db'

export const BACKUP_HEARTBEAT_KEY = 'backup.heartbeat'

export interface BackupHeartbeat {
  at: string
  snapshotId: string | null
}

/**
 * Latest offsite-backup heartbeat, or null when the installation has never
 * reported one (e.g. self-hosted without the backup job configured).
 */
export async function getBackupHeartbeat(): Promise<BackupHeartbeat | null> {
  const row = await db.systemSetting.findUnique({
    where: { key: BACKUP_HEARTBEAT_KEY },
  })
  if (!row) return null
  try {
    const parsed = JSON.parse(row.value)
    if (typeof parsed?.at !== 'string') return null
    return { at: parsed.at, snapshotId: parsed.snapshotId ?? null }
  } catch {
    return null
  }
}
