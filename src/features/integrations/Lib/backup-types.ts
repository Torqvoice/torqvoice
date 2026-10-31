/**
 * Types shared by the backup engine, the destination connectors and the UI.
 *
 * A backup destination is an integration with the 'backup.target' capability.
 * The engine runs restic against the repository the connector describes; the
 * settings below are the ones every destination shares, saved on the
 * connection like any other connector setting.
 */

export type BackupFrequency = 'hourly' | 'every4h' | 'daily' | 'weekly' | 'monthly'

/** Data only, or data with the workshop's own secret keys (Stripe, AI, webhooks). */
export type BackupContents = 'data' | 'dataAndSecrets'

export interface BackupSettings {
  frequency: BackupFrequency
  /** HH:mm on the workshop clock; daily, weekly and monthly runs. */
  time: string
  /** 0 = Sunday .. 6 = Saturday; weekly runs. */
  weekday: number
  /** '1'..'28' or 'last'; monthly runs. */
  monthDay: string
  contents: BackupContents
  includeFiles: boolean
  keepHourly: number
  keepDaily: number
  keepWeekly: number
  keepMonthly: number
}

export type BackupRunStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'
/** What started the run: the schedule, a person, or a person putting a snapshot back. */
export type BackupTrigger = 'scheduled' | 'manual' | 'restore'
/**
 * Which repository: a destination the workshop connected, or the one
 * Torqvoice keeps for it on the cloud instance.
 */
export type BackupKind = 'destination' | 'platform'

export interface BackupRunView {
  id: string
  kind: BackupKind
  trigger: BackupTrigger
  status: BackupRunStatus
  startedAt: string | null
  finishedAt: string | null
  snapshotId: string | null
  /** The safety copy a restore took first, which undoes it. */
  safetySnapshotId: string | null
  /** Support's reason for a restore started from torqvoice.com. */
  reason: string | null
  filesNew: number | null
  bytesAdded: number | null
  totalBytes: number | null
  error: string | null
}

/** One restore point in a platform repository, as stored after each run. */
export interface PlatformSnapshotView {
  id: string
  shortId: string
  /** When it was taken, ISO 8601. */
  time: string
  bytes: number | null
  trigger: 'scheduled' | 'manual' | null
  /** The safety copy a restore took of the workshop right before replacing it. */
  preRestore: boolean
}

/** What the Backups card on Settings, Data shows for the platform repository. */
export interface PlatformBackupOverview {
  /** The plan includes platform backups and the server runs them. */
  active: boolean
  /** Runs stopped because the plan no longer includes them; the repository waits out a grace period. */
  paused: boolean
  /** When a paused repository will be forgotten, ISO 8601; null when not paused or already gone. */
  purgeDueAt: string | null
  lastGoodAt: string | null
  nextRunAt: string | null
  repositorySize: number | null
  snapshots: PlatformSnapshotView[]
  recent: BackupRunView[]
  running: boolean
  restoring: boolean
  /** Position of the workshop's queued run, 0 when none is queued. */
  queuedAhead: number
  canRestore: boolean
  workshopName: string
}

/** What the connection page shows for a backup destination. */
export interface BackupOverview {
  /** Whose backups these are: the card keys what it caches on it, so a switch of workshop never shows another's list. */
  organizationId: string
  lastGood: BackupRunView | null
  lastRun: BackupRunView | null
  nextRunAt: string | null
  /** A run is in progress right now for this connection, a backup or a restore. */
  running: boolean
  /** The run in progress is a restore: the workshop's data is being replaced. */
  restoring: boolean
  recent: BackupRunView[]
  /** Repository size in bytes from the last stats call, when known. */
  repositorySize: number | null
  /** Whether the person looking may restore a snapshot. */
  canRestore: boolean
  /** Who may: the owner alone on the cloud, an owner or administrator self-hosted. */
  restoreRole: 'owner' | 'admin'
  /** The workshop's name, which a restore is confirmed by typing. */
  workshopName: string
}

/** One backup at the destination, as the Restore section lists it. */
export interface BackupSnapshotView {
  id: string
  shortId: string
  /** When it was taken, ISO 8601. */
  time: string
  /** Bytes the backup covered, when restic recorded a summary. */
  bytes: number | null
  /** New files and bytes added by it, as the run row would say, when restic recorded a summary. */
  filesNew: number | null
  dataAdded: number | null
  /** Whether photos and files were included. */
  files: boolean
  /** What started it, when the tags say. */
  trigger: 'scheduled' | 'manual' | null
  /**
   * Taken by this workshop. A repository connected again from a new server
   * holds the old workshop's snapshots under its id, and those restore too.
   */
  thisWorkshop: boolean
}

/**
 * What a destination connector gives the engine: where restic writes and how
 * it authenticates. `env` carries the destination's own keys and nothing
 * else; the engine never adds anything from the server's environment.
 */
export interface ResticRepository {
  /** restic repository string, e.g. 's3:https://s3.eu-central-1.amazonaws.com/bucket/prefix'. */
  repository: string
  env: Record<string, string>
  /** Extra restic options passed as `-o key=value`, such as s3.region. */
  options?: Record<string, string>
}

/**
 * Where an open of a restore point has got to, in order: the data file is
 * looked up in the snapshot, pulled out and decrypted, read, then indexed by
 * dataset. `connecting` is what the page shows before the first step is reached.
 */
export const EXPLORE_STAGES = ['connecting', 'locating', 'pulling', 'reading', 'indexing'] as const
export type ExploreStage = (typeof EXPLORE_STAGES)[number]
