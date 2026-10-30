/**
 * What every backup destination shares.
 *
 * A destination connector is a manifest with the 'backup.target' capability,
 * the settings below, one credential (the repository password) and a server
 * module whose `backupTarget.repository()` says where restic should write.
 * The engine in src/lib/backup/engine.ts does the rest, so a new destination
 * is a manifest and one function.
 */

import { db } from '@/lib/db'
import { nextRunAfter, readBackupSettings, spreadOffsetMinutes } from '@/lib/backup/schedule'
import { isCloudMode } from '@/lib/features'
import { workshopTimeZone } from '@/lib/workshop-timezone'
import type { BackupOverview, BackupRunView, BackupSettings } from './backup-types'
import type { CredentialField, SettingField } from './types'

export const BACKUP_CAPABILITY = 'backup.target'

/** The connection row state keys the engine and the cron keep. */
export const BACKUP_STATE = {
  /** When the cron last started a scheduled run, for working out the next one. */
  lastScheduledAt: 'backup.lastScheduledAt',
  /** When the cron started the very first scheduled run: the overdue clock for a destination that has never succeeded. */
  firstScheduledAt: 'backup.firstScheduledAt',
  /** When the last run finished with a snapshot. */
  lastGoodAt: 'backup.lastGoodAt',
  /** Repository size in bytes after the last stats call. */
  repositorySize: 'backup.repositorySize',
  lastPruneAt: 'backup.lastPruneAt',
  lastCheckAt: 'backup.lastCheckAt',
  /** Throttles the failure email to one a day. */
  lastFailureMailAt: 'backup.lastFailureMailAt',
  /** Throttles the overdue alert to one a day. */
  lastOverdueAlertAt: 'backup.lastOverdueAlertAt',
  /** One retry half an hour after a failed scheduled run. */
  retryAt: 'backup.retryAt',
} as const

/**
 * The password the repository is encrypted with. The workshop makes it up
 * (the connect page offers to generate one) and keeps a copy; the server
 * keeps it sealed in the vault so scheduled runs work unattended.
 */
export const BACKUP_PASSWORD_FIELD: CredentialField = {
  key: 'password',
  label: 'password',
  type: 'password',
  required: true,
  help: 'passwordHelp',
  generate: 'password',
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/** Schedule, contents and retention, the same on every destination. */
export const BACKUP_SETTINGS: SettingField[] = [
  {
    key: 'frequency',
    type: 'select',
    label: 'frequency',
    default: 'daily',
    required: true,
    options: [
      { value: 'hourly', label: 'frequencyHourly' },
      { value: 'every4h', label: 'frequencyEvery4h' },
      { value: 'daily', label: 'frequencyDaily' },
      { value: 'weekly', label: 'frequencyWeekly' },
      { value: 'monthly', label: 'frequencyMonthly' },
    ],
  },
  { key: 'time', type: 'text', label: 'time', help: 'timeHelp', default: '02:00' },
  {
    key: 'weekday',
    type: 'select',
    label: 'weekday',
    default: '0',
    showWhen: { key: 'frequency', equals: 'weekly' },
    options: WEEKDAYS.map((day, i) => ({ value: String(i), label: day })),
  },
  {
    key: 'monthDay',
    type: 'select',
    label: 'monthDay',
    default: '1',
    showWhen: { key: 'frequency', equals: 'monthly' },
    options: [
      ...Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
      { value: 'last', label: 'monthDayLast' },
    ],
  },
  {
    key: 'contents',
    type: 'select',
    label: 'contents',
    help: 'contentsHelp',
    default: 'data',
    options: [
      { value: 'data', label: 'contentsData' },
      { value: 'dataAndSecrets', label: 'contentsDataAndSecrets' },
    ],
  },
  {
    key: 'includeFiles',
    type: 'boolean',
    label: 'includeFiles',
    help: 'includeFilesHelp',
    default: true,
  },
  { key: 'keepHourly', type: 'number', label: 'keepHourly', help: 'keepHourlyHelp', default: 24 },
  { key: 'keepDaily', type: 'number', label: 'keepDaily', default: 14 },
  { key: 'keepWeekly', type: 'number', label: 'keepWeekly', default: 8 },
  {
    key: 'keepMonthly',
    type: 'number',
    label: 'keepMonthly',
    help: 'keepMonthlyHelp',
    default: 12,
  },
]

/**
 * Who may put a backup back. Self-hosted: an owner or administrator, as for
 * the upload under Settings, Data. On the cloud, where hundreds of workshops
 * share one database, the owner alone, read from the membership itself: a
 * platform administrator's rights say nothing about who owns the workshop.
 */
export async function canRestoreBackups(ctx: {
  userId: string
  organizationId: string
  isAdmin: boolean
}): Promise<boolean> {
  if (!isCloudMode()) return ctx.isAdmin
  const member = await db.organizationMember.findFirst({
    where: { userId: ctx.userId, organizationId: ctx.organizationId },
    select: { role: true },
  })
  return member?.role === 'owner'
}

/** The host restic files this workshop's snapshots under, and the tag on each. */
export function backupHost(organizationId: string): string {
  return `torqvoice-${organizationId}`
}

export function backupTag(organizationId: string): string {
  return `org:${organizationId}`
}

/** A workshop-wide offset so cloud runs do not all start on the hour. */
export function backupOffsetMinutes(organizationId: string): number {
  return isCloudMode() ? spreadOffsetMinutes(organizationId) : 0
}

type RunRow = {
  id: string
  trigger: string
  status: string
  startedAt: Date | null
  finishedAt: Date | null
  snapshotId: string | null
  filesNew: number | null
  bytesAdded: bigint | null
  totalBytes: bigint | null
  error: string | null
}

export function runView(row: RunRow): BackupRunView {
  return {
    id: row.id,
    trigger: row.trigger as BackupRunView['trigger'],
    status: row.status as BackupRunView['status'],
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    snapshotId: row.snapshotId,
    filesNew: row.filesNew,
    bytesAdded: row.bytesAdded === null ? null : Number(row.bytesAdded),
    totalBytes: row.totalBytes === null ? null : Number(row.totalBytes),
    error: row.error,
  }
}

function stateDate(state: Record<string, unknown>, key: string): Date | null {
  const v = state[key]
  if (typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** When the next scheduled run is due for this connection. */
export async function nextScheduledRun(
  organizationId: string,
  settings: BackupSettings,
  state: Record<string, unknown>,
  now = new Date()
): Promise<Date> {
  const timeZone = await workshopTimeZone(organizationId)
  const last = stateDate(state, BACKUP_STATE.lastScheduledAt)
  return nextRunAfter(settings, last ?? now, timeZone, backupOffsetMinutes(organizationId))
}

/** What the connection page shows. */
export async function backupOverview(
  connection: {
    id: string
    organizationId: string
    settings: Record<string, unknown>
    state: Record<string, unknown>
  },
  viewer: { canRestore: boolean } = { canRestore: false }
): Promise<BackupOverview> {
  const [recentRows, lastGoodRow, organization] = await Promise.all([
    db.backupRun.findMany({
      where: { connectionId: connection.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    // A restore that finished is not a backup that did.
    db.backupRun.findFirst({
      where: { connectionId: connection.id, status: 'done', trigger: { not: 'restore' } },
      orderBy: { createdAt: 'desc' },
    }),
    db.organization.findUnique({
      where: { id: connection.organizationId },
      select: { name: true },
    }),
  ])
  const settings = readBackupSettings(connection.settings)
  const next = await nextScheduledRun(connection.organizationId, settings, connection.state)
  const size = connection.state[BACKUP_STATE.repositorySize]
  return {
    lastGood: lastGoodRow ? runView(lastGoodRow) : null,
    lastRun: recentRows[0] ? runView(recentRows[0]) : null,
    nextRunAt: next.toISOString(),
    running: recentRows.some((r) => r.status === 'running' || r.status === 'queued'),
    restoring: recentRows.some(
      (r) => r.trigger === 'restore' && (r.status === 'running' || r.status === 'queued')
    ),
    recent: recentRows.map(runView),
    repositorySize: typeof size === 'number' ? size : null,
    canRestore: viewer.canRestore,
    restoreRole: isCloudMode() ? 'owner' : 'admin',
    workshopName: organization?.name ?? '',
  }
}
