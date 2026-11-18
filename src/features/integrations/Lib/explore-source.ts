import { z } from 'zod'
import { BACKUP_CAPABILITY } from '@/features/integrations/Lib/backup'
import { connectorAllowed } from '@/features/integrations/Lib/plan'
import { getManifest } from '@/integrations/registry'
import type { RunTarget } from '@/lib/backup/engine'
import { platformBackupAllowed, platformBackupConfig } from '@/lib/backup/platform'
import { db } from '@/lib/db'
import { FeatureGatedError, getFeatures } from '@/lib/features'

/**
 * Which repository a restore point is read from, as the explorer names it:
 * the platform one, or a destination by its connector id. Resolved to the
 * workshop's own run target, never to anything the caller could point
 * elsewhere, and only when the plan allows looking.
 */
export const exploreSourceSchema = z.union([
  z.object({ kind: z.literal('platform') }),
  z.object({ kind: z.literal('destination'), connectorId: z.string().min(1).max(64) }),
])
export type ExploreSource = z.infer<typeof exploreSourceSchema>

export async function resolveExploreTarget(
  organizationId: string,
  source: ExploreSource
): Promise<RunTarget> {
  const features = await getFeatures(organizationId)
  if (source.kind === 'platform') {
    if (!platformBackupConfig()) throw new Error('Backups by Torqvoice are not available here')
    if (!platformBackupAllowed(features)) {
      // During the grace period after a downgrade the repository is still
      // there, and looking inside it is part of what the grace period is for.
      const row = await db.platformBackup.findUnique({
        where: { organizationId },
        select: { pausedAt: true, purgedAt: true },
      })
      if (!row?.pausedAt || row.purgedAt) {
        throw new FeatureGatedError('platformBackups', 'Backups by Torqvoice are not in your plan.')
      }
    }
    return { kind: 'platform', organizationId }
  }
  const manifest = getManifest(source.connectorId)
  if (!manifest?.capabilities.includes(BACKUP_CAPABILITY)) {
    throw new Error('This integration is not a backup destination')
  }
  if (!connectorAllowed(manifest, features)) {
    throw new FeatureGatedError(
      manifest.plan ?? 'integrations',
      `${manifest.name} is not included in your plan.`
    )
  }
  const row = await db.integrationConnection.findUnique({
    where: { organizationId_connectorId: { organizationId, connectorId: source.connectorId } },
    select: { id: true, status: true },
  })
  if (!row || (row.status !== 'active' && row.status !== 'error')) {
    throw new Error('Connect the destination first')
  }
  return { kind: 'destination', connectionId: row.id }
}
