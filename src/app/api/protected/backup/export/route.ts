import { NextRequest, NextResponse } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { getAuthContext } from '@/lib/get-auth-context'
import { ZipArchive } from 'archiver'
import { isDemoMode } from '@/lib/demo'
import { UPLOAD_CATEGORIES } from '@/lib/backup/manifest'
import {
  type BuildDataOptions,
  DEFAULT_OPTIONS,
  type ExportOptions,
  writeBackupData,
} from '@/lib/backup/build-data'
import { readdir, stat } from 'fs/promises'
import path from 'path'
import { PassThrough, Readable } from 'stream'
import { uploadsRoot } from '@/lib/upload-root'

export const maxDuration = 300

/** Already compressed: deflating them again costs CPU and saves nothing. */
const STORED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.avif',
  '.heic',
  '.heif',
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.pdf',
])

/** The POST body's `include`, with `secrets` off unless it is exactly true. */
function readExportOptions(body: unknown): BuildDataOptions {
  const include = (body as { include?: unknown } | null)?.include
  if (!include || typeof include !== 'object') {
    return { ...DEFAULT_OPTIONS, includeSecrets: false }
  }
  const { secrets, ...rest } = include as Partial<ExportOptions> & { secrets?: unknown }
  return { ...DEFAULT_OPTIONS, ...rest, includeSecrets: secrets === true }
}

/** Queues the organisation's own upload folders. archive.file opens each one lazily. */
async function appendUploads(archive: ZipArchive, organizationId: string) {
  const uploadsDir = path.join(uploadsRoot(), organizationId)

  for (const category of UPLOAD_CATEGORIES) {
    const categoryDir = path.join(uploadsDir, category)
    try {
      const dirStat = await stat(categoryDir)
      if (!dirStat.isDirectory()) continue

      const files = await readdir(categoryDir)
      for (const file of files) {
        const filePath = path.join(categoryDir, file)
        const fileStat = await stat(filePath)
        if (!fileStat.isFile()) continue

        archive.file(filePath, {
          name: `files/${category}/${file}`,
          stats: fileStat,
          store: STORED_EXTENSIONS.has(path.extname(file).toLowerCase()),
        } as Parameters<ZipArchive['file']>[1])
      }
    } catch {
      // Category directory doesn't exist, skip
    }
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (limited) return limited
  if (isDemoMode) {
    return NextResponse.json({ error: 'This action is disabled on the demo.' }, { status: 403 })
  }

  const ctx = await getAuthContext()

  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // Reading or replacing the whole workshop is an owner's or admin's call.
  if (!ctx.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let options = readExportOptions(null)
  try {
    options = readExportOptions(await request.json())
  } catch {
    // If no body or invalid JSON, use defaults
  }

  const organizationId = ctx.organizationId
  const archive = new ZipArchive({ zlib: { level: 6 } })
  const json = new PassThrough()
  archive.append(json, { name: 'data.json' })

  // A download the browser dropped stops the writer instead of leaving it waiting.
  archive.on('close', () => json.destroy())

  void (async () => {
    try {
      await writeBackupData(organizationId, options, json)
      json.end()
      if (options.files) await appendUploads(archive, organizationId)
      await archive.finalize()
    } catch (error) {
      console.error('[backup/export] Error:', error)
      // Fail the download rather than hand over a zip that looks complete.
      json.destroy()
      archive.destroy(error instanceof Error ? error : new Error('Export failed'))
    }
  })()

  const dateStr = new Date().toISOString().slice(0, 10)
  return new Response(Readable.toWeb(archive) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="torqvoice-backup-${dateStr}.zip"`,
    },
  })
}

/**
 * The older, no-options export.
 *
 * It used to be a second implementation of the same thing, and it fell behind:
 * it predated the tire hotel and never learned about anything added since, so
 * whoever called it received a quietly incomplete backup. It now runs the same
 * export as everything else, with every option on.
 */
export async function GET(request: NextRequest) {
  const limited = rateLimit(request, { limit: 5, windowMs: 60_000 })
  if (limited) return limited
  return POST(
    new NextRequest(request.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ include: DEFAULT_OPTIONS }),
    })
  )
}
