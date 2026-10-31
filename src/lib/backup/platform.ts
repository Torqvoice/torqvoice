import { createHmac } from 'node:crypto'
import { backupHost, backupTag } from '@/features/integrations/Lib/backup'
import type { ResticRepository } from '@/features/integrations/Lib/backup-types'
import type { PlanFeatures } from '@/lib/features'
import { isCloudMode } from '@/lib/features'

/**
 * The backups Torqvoice runs for a workshop on the cloud instance.
 *
 * One restic repository per workshop, in a bucket of ours that holds nothing
 * else, under keys the workshop never sees. Everything here comes from the
 * environment, never from a connection row: a workshop cannot point this at
 * storage of its own, and a self-hosted install, where none of these
 * variables are set, has no platform backups at all.
 *
 *   PLATFORM_BACKUP_S3_ENDPOINT   https://<account>.r2.cloudflarestorage.com
 *   PLATFORM_BACKUP_S3_BUCKET     torqvoice-workshop-backups
 *   PLATFORM_BACKUP_S3_REGION     auto (R2) or the bucket's region
 *   PLATFORM_BACKUP_S3_ACCESS_KEY, PLATFORM_BACKUP_S3_SECRET_KEY
 *   PLATFORM_BACKUP_MASTER_KEY    at least 32 characters; every repository
 *                                 password is derived from it, so it lives
 *                                 in the disaster recovery vault
 */

export interface PlatformBackupConfig {
  endpoint: string
  bucket: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  masterKey: string
}

const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/
const ORGANIZATION_ID = /^[a-z0-9]+$/i

function env(name: string): string {
  return (process.env[name] ?? '').trim()
}

/**
 * The configuration when it is complete and the instance is the cloud one;
 * null otherwise. A half-set configuration is treated as unset and said so
 * once in the log, rather than backing up to a guessed address.
 */
let warned = false
export function platformBackupConfig(): PlatformBackupConfig | null {
  if (!isCloudMode()) return null
  const endpoint = env('PLATFORM_BACKUP_S3_ENDPOINT')
  const bucket = env('PLATFORM_BACKUP_S3_BUCKET').toLowerCase()
  const region = env('PLATFORM_BACKUP_S3_REGION') || 'auto'
  const accessKeyId = env('PLATFORM_BACKUP_S3_ACCESS_KEY')
  const secretAccessKey = env('PLATFORM_BACKUP_S3_SECRET_KEY')
  const masterKey = env('PLATFORM_BACKUP_MASTER_KEY')
  const set = [endpoint, bucket, accessKeyId, secretAccessKey, masterKey].filter(Boolean).length
  if (set === 0) return null
  const problems: string[] = []
  let origin = ''
  try {
    const url = new URL(endpoint)
    if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.username) {
      problems.push('PLATFORM_BACKUP_S3_ENDPOINT must be a plain https origin')
    }
    origin = url.origin
  } catch {
    problems.push('PLATFORM_BACKUP_S3_ENDPOINT is not a URL')
  }
  if (!BUCKET.test(bucket) || bucket.includes('--')) {
    problems.push('PLATFORM_BACKUP_S3_BUCKET is not a valid bucket name')
  }
  if (!accessKeyId || !secretAccessKey) {
    problems.push('PLATFORM_BACKUP_S3_ACCESS_KEY and PLATFORM_BACKUP_S3_SECRET_KEY are required')
  }
  if (masterKey.length < 32) {
    problems.push('PLATFORM_BACKUP_MASTER_KEY must be at least 32 characters')
  }
  if (problems.length > 0) {
    if (!warned) {
      warned = true
      console.error(`[backup] platform backups are off: ${problems.join('; ')}`)
    }
    return null
  }
  return { endpoint: origin, bucket, region, accessKeyId, secretAccessKey, masterKey }
}

export function platformBackupsEnabled(): boolean {
  return platformBackupConfig() !== null
}

/** Whether the plan puts this workshop in the cycle. */
export function platformBackupAllowed(features: Pick<PlanFeatures, 'platformBackups'>): boolean {
  return features.platformBackups
}

/**
 * The repository password for one workshop: derived from the master key, so
 * one repository's password opens no other and nothing per workshop has to
 * be stored. Changing the master key makes every repository unreadable, so
 * it never changes; it is backed up with the other secrets.
 */
export function platformRepositoryPassword(masterKey: string, organizationId: string): string {
  if (!ORGANIZATION_ID.test(organizationId)) throw new Error('Unexpected organisation id')
  return createHmac('sha256', masterKey)
    .update(`torqvoice-platform-backup:${organizationId}`)
    .digest('hex')
}

/** Where restic writes one workshop's platform backups, and how it signs in. */
export function platformRepository(
  config: PlatformBackupConfig,
  organizationId: string
): { repository: ResticRepository; password: string } {
  if (!ORGANIZATION_ID.test(organizationId)) throw new Error('Unexpected organisation id')
  return {
    repository: {
      repository: `s3:${config.endpoint}/${config.bucket}/workshops/${organizationId}`,
      env: {
        AWS_ACCESS_KEY_ID: config.accessKeyId,
        AWS_SECRET_ACCESS_KEY: config.secretAccessKey,
      },
      options: { 's3.region': config.region },
    },
    password: platformRepositoryPassword(config.masterKey, organizationId),
  }
}

/** The repository for a workshop, or a clear error when platform backups are off. */
export function platformRepositoryFor(organizationId: string) {
  const config = platformBackupConfig()
  if (!config) throw new Error('Platform backups are not configured on this server')
  return platformRepository(config, organizationId)
}

/**
 * What a platform repository keeps: the hourly schedule's last two days,
 * then a month of days, two months of weeks and half a year of months. Fixed,
 * so the restore points a workshop is promised are the same for everyone.
 */
export const PLATFORM_RETENTION = {
  keepHourly: 48,
  keepDaily: 30,
  keepWeekly: 8,
  keepMonthly: 6,
} as const

/** Tag on every snapshot taken into a platform repository. */
export const PLATFORM_TAG = 'platform'
/** Tag on the snapshot a restore takes of the workshop right before replacing it. */
export const PRE_RESTORE_TAG = 'pre-restore'
/** How long a pre-restore snapshot is kept, whatever the retention policy says. */
export const PRE_RESTORE_KEEP = '90d'

/** How long a repository is kept after the workshop's plan stopped including it. */
export const PAUSED_GRACE_MS = 30 * 24 * 60 * 60 * 1000

export function platformHost(organizationId: string): string {
  return backupHost(organizationId)
}

export function platformTags(organizationId: string, trigger: string): string[] {
  return [backupTag(organizationId), trigger, PLATFORM_TAG]
}
