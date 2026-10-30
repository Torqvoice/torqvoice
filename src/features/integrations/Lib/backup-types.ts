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
export type BackupTrigger = 'scheduled' | 'manual'

export interface BackupRunView {
  id: string
  trigger: BackupTrigger
  status: BackupRunStatus
  startedAt: string | null
  finishedAt: string | null
  snapshotId: string | null
  filesNew: number | null
  bytesAdded: number | null
  totalBytes: number | null
  error: string | null
}

/** What the connection page shows for a backup destination. */
export interface BackupOverview {
  lastGood: BackupRunView | null
  lastRun: BackupRunView | null
  nextRunAt: string | null
  /** A run is in progress right now for this connection. */
  running: boolean
  recent: BackupRunView[]
  /** Repository size in bytes from the last stats call, when known. */
  repositorySize: number | null
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
