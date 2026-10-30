'use server'

import { revalidatePath } from 'next/cache'
import { BACKUP_CAPABILITY, BACKUP_STATE, nextScheduledRun } from '../Lib/backup'
import { connectorAllowed } from '../Lib/plan'
import { getManifest } from '@/integrations/registry'
import { BackupBusyError, queueBackupRun, runBackup } from '@/lib/backup/engine'
import { readBackupSettings } from '@/lib/backup/schedule'
import { db } from '@/lib/db'
import { demoGuard } from '@/lib/demo'
import { FeatureGatedError, getFeatures } from '@/lib/features'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'

const SETTINGS_PERMISSION = [
  { action: PermissionAction.UPDATE, subject: PermissionSubject.SETTINGS },
]
const READ_PERMISSION = [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }]

export interface BackupDestinationSummary {
  connectorId: string
  name: string
  status: string
  lastGood: string | null
  nextRunAt: string | null
  lastError: string | null
}

/**
 * Start a backup to this destination now. The run goes on in the background
 * and the page follows it; refused while one is queued or running.
 */
export async function runBackupNow(connectorId: string) {
  return withAuth(
    async ({ organizationId }): Promise<{ runId: string }> => {
      demoGuard()
      const manifest = getManifest(connectorId)
      if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) {
        throw new Error('This integration is not a backup destination')
      }
      if (!connectorAllowed(manifest, await getFeatures(organizationId))) {
        throw new FeatureGatedError(
          manifest.plan ?? 'integrations',
          `${manifest.name} is not included in your plan.`
        )
      }
      const row = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId } },
        select: { id: true, status: true },
      })
      if (!row || (row.status !== 'active' && row.status !== 'error')) {
        throw new Error('Connect the destination first')
      }
      let runId: string
      try {
        runId = (await queueBackupRun(row.id, 'manual')).runId
      } catch (err) {
        if (err instanceof BackupBusyError) throw new Error('A backup is already running.')
        throw err
      }
      // Not awaited: a first backup can take an hour. The row is what the
      // page watches; a failure is recorded on it and reported by the engine.
      void runBackup(runId).catch((err) => console.error('[backup] manual run failed:', err))
      revalidatePath(`/settings/integrations/${connectorId}`)
      return { runId }
    },
    {
      requiredPermissions: SETTINGS_PERMISSION,
      audit: ({ result }) => ({
        action: 'integration.backup_run',
        entity: 'BackupRun',
        entityId: result.runId,
        details: {
          key: 'backup_run_started',
          params: { name: getManifest(connectorId)?.name ?? connectorId },
        },
      }),
    }
  )
}

/** The workshop's backup destinations, for Settings -> Data. */
export async function listBackupDestinations() {
  return withAuth(
    async ({ organizationId }): Promise<BackupDestinationSummary[]> => {
      const rows = await db.integrationConnection.findMany({
        where: { organizationId, status: { in: ['active', 'error'] } },
        select: {
          id: true,
          connectorId: true,
          status: true,
          settings: true,
          state: true,
          lastError: true,
        },
      })
      const out: BackupDestinationSummary[] = []
      for (const row of rows) {
        const manifest = getManifest(row.connectorId)
        if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) continue
        const state = (row.state as Record<string, unknown>) ?? {}
        const settings = readBackupSettings((row.settings as Record<string, unknown>) ?? {})
        const lastGood = state[BACKUP_STATE.lastGoodAt]
        const next = await nextScheduledRun(organizationId, settings, state)
        out.push({
          connectorId: row.connectorId,
          name: manifest.name,
          status: row.status,
          lastGood: typeof lastGood === 'string' ? lastGood : null,
          nextRunAt: next.toISOString(),
          lastError: row.lastError,
        })
      }
      return out
    },
    { requiredPermissions: READ_PERMISSION }
  )
}
