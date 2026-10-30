import { NextRequest, NextResponse } from 'next/server'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { rateLimit } from '@/lib/rate-limit'
import { getAuthContext } from '@/lib/get-auth-context'
import { isDemoMode } from '@/lib/demo'
import { isCloudMode } from '@/lib/features'
import { backupLockHolder } from '@/lib/backup/engine'
import { RestoreRefusedError, restoreLockHolder } from '@/lib/backup/tenancy'
import {
  type BackupData,
  assertSupportedBackup,
  restoreBackup,
  zipFileSource,
} from '@/lib/backup/import'
import {
  openZip,
  readEntryJson,
  readJsonFile,
  spoolUpload,
  type OpenedZip,
  type SpooledUpload,
} from '@/lib/backup/zip-file'

/** Larger than any workshop's backup by a wide margin, and small enough to hold in memory. */
const MAX_BACKUP_UPLOAD_BYTES = 200 * 1024 * 1024

/**
 * The upload goes to a temporary file as it arrives, and data.json is parsed
 * straight out of the archive: the one thing held in memory is the parsed
 * backup. The caller closes the zip and removes the upload when it is done.
 */
async function parseBackup(
  request: NextRequest
): Promise<{ backup: BackupData; files: OpenedZip | null; upload: SpooledUpload | null }> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/json')) {
    const backup = await request.json()
    return { backup, files: null, upload: null }
  }

  // For any other content type, write it to disk and look at the first bytes
  assertContentLength(request, MAX_BACKUP_UPLOAD_BYTES)
  const upload = await spoolUpload(request, MAX_BACKUP_UPLOAD_BYTES, 'torqvoice-restore')
  try {
    if (upload.isZip) {
      const zip = await openZip(upload.path)
      const dataJson = zip.find('data.json')
      if (!dataJson) {
        zip.close()
        throw new Error('Zip archive does not contain data.json')
      }
      const backup = await readEntryJson<BackupData>(zip, dataJson)
      return { backup, files: zip, upload }
    }
    // Plain JSON with the wrong content type
    const backup = await readJsonFile<BackupData>(upload.path)
    return { backup, files: null, upload }
  } catch (err) {
    await upload.remove()
    throw err
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (limited) return limited
  if (isDemoMode) {
    return NextResponse.json({ error: 'Backup import is disabled on the demo.' }, { status: 403 })
  }

  const ctx = await getAuthContext()

  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Reading or replacing the whole workshop is an owner's or admin's call.
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // On the cloud, where workshops share a database, the owner's alone.
  if (isCloudMode() && ctx.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only the workshop owner can restore a backup here', code: 'owner_only' },
      { status: 403 }
    )
  }
  // Said before the upload is read, so a large file is not taken for nothing.
  if (restoreLockHolder() || backupLockHolder()) {
    return NextResponse.json(
      { error: 'A backup or restore is already running on this server', code: 'busy' },
      { status: 409 }
    )
  }

  let backup: BackupData
  let zipFiles: OpenedZip | null = null
  let upload: SpooledUpload | null = null

  try {
    const result = await parseBackup(request)
    backup = result.backup
    zipFiles = result.files
    upload = result.upload
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid backup file'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  // The archive stays open until the files are restored; the upload goes
  // whichever way the request ends.
  const discard = async () => {
    zipFiles?.close()
    zipFiles = null
    await upload?.remove()
    upload = null
  }

  // The same checks the restore makes, said with the status the browser expects.
  try {
    assertSupportedBackup(backup)
  } catch (err) {
    await discard()
    const message = err instanceof Error ? err.message : 'Invalid backup file'
    return NextResponse.json({ error: message }, { status: 400 })
  }

  try {
    const { redactedSettings } = await restoreBackup(
      ctx,
      backup,
      zipFiles ? zipFileSource(zipFiles) : null
    )
    return NextResponse.json({ success: true, redactedSettings })
  } catch (error) {
    if (error instanceof RestoreRefusedError) {
      // Not a failure: the file, or the moment, was refused. Said plainly.
      const status = error.code === 'busy' ? 409 : error.code === 'owner_only' ? 403 : 400
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    console.error('[backup/import] Error:', error)
    // The detail stays in the log; a Prisma or parser message is not for the browser.
    console.error('[backup import]', error)
    const message = 'Import failed'
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    await discard().catch(() => undefined)
  }
}
