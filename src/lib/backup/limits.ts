/**
 * How much of a restore point this server is willing to hold at once.
 *
 * A workshop's data file is parsed into memory whole, by a restore (every id
 * in it is checked against the workshop's own rows before one is written)
 * and by the restore point explorer. Parsed, a JSON file takes three to five
 * times its size on disk in heap, and the cloud box has a few gigabytes
 * shared with the database. So the cap is on the file: a workshop whose
 * data file outgrows it needs a bigger server before it needs a restore.
 *
 * A destination's repository is the workshop's own, under keys and a
 * password the workshop holds, so what comes out of it is treated like any
 * other upload and refused before it can fill the disk or the heap.
 */

const DEFAULT_MAX_DATA_FILE_MB = 128

/**
 * The largest data.json read into memory, by a restore or the explorer:
 * 128 MiB unless BACKUP_MAX_DATA_FILE_MB says otherwise. A server with the
 * memory for it raises the number; a backup run whose data file is over it
 * says so in its log, so the operator hears before a restore is needed.
 */
export function maxDataFileBytes(): number {
  const mb = Number(process.env.BACKUP_MAX_DATA_FILE_MB)
  const chosen = Number.isFinite(mb) && mb >= 16 ? Math.floor(mb) : DEFAULT_MAX_DATA_FILE_MB
  return chosen * 1024 * 1024
}

/** What must stay free on the data disk once a snapshot has been written out. */
export const RESTORE_DISK_HEADROOM_BYTES = 1024 * 1024 * 1024

/** Restore points one server keeps parsed in memory at a time. */
export const MAX_OPEN_RESTORE_POINTS = 2
