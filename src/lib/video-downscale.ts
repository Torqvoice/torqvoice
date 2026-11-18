import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { db } from '@/lib/db'
import { discardUnsavedUpload, releaseFiles } from '@/lib/files/manager'
import { uploadsRoot } from '@/lib/upload-root'
import { ffmpegInputFormat, type VideoContainer } from '@/lib/video-sniff'

/**
 * Brings a video shot above 1080p down to 1080p, after it has been saved.
 *
 * A clip picked from a phone's library was shot by the phone's own camera at
 * whatever it was set to, and at 4K a minute of it is hundreds of megabytes
 * that nobody looking at a worn brake disc needs. The technician's app records
 * at 1080p itself; this is for everything that did not come from it.
 *
 * It runs after the upload has been answered, never during it. Re-encoding 4K
 * takes minutes, and a phone holding a request open that long with nothing
 * coming back gives up and reports a failure for a file that arrived. So the
 * original is saved and served straight away, and the row is pointed at the
 * smaller copy when there is one.
 *
 * Anything that goes wrong leaves the original where it was: no ffmpeg on
 * this install, a take it cannot read, an attachment deleted in the meantime.
 */

const execFileAsync = promisify(execFile)

/** The shorter side of a 1080p picture, whichever way the phone was held. */
export const MAX_SHORT_SIDE = 1080

const PROBE_TIMEOUT_MS = 30_000
const ENCODE_TIMEOUT_MS = 15 * 60_000

/** Whether a picture of this size is larger than 1080p in either orientation. */
export function needsDownscale(width: number, height: number): boolean {
  return Math.min(width, height) > MAX_SHORT_SIDE
}

/** The picture size out of ffprobe's `WIDTHxHEIGHT` line, or null for anything else. */
export function parseProbedSize(output: string): { width: number; height: number } | null {
  const match = /^(\d+)x(\d+)/.exec(output.trim())
  if (!match) return null
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * The arguments for the re-encode.
 *
 * The demuxer is pinned and only local files may be opened, for the reasons
 * given in video-sniff. The shorter side becomes 1080 and the other follows,
 * so a clip filmed upright stays upright: ffmpeg applies the phone's rotation
 * before the filter sees the picture. Eight-bit H.264 with the index at the
 * front, because that is what every browser and both phones play.
 */
export function downscaleArgs(
  inputPath: string,
  container: VideoContainer,
  outputPath: string
): string[] {
  const side = MAX_SHORT_SIDE
  return [
    '-nostdin',
    '-protocol_whitelist',
    'file,crypto',
    '-f',
    ffmpegInputFormat(container),
    '-i',
    inputPath,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-sn',
    '-dn',
    '-vf',
    `scale='if(gt(iw,ih),-2,${side})':'if(gt(iw,ih),${side},-2)'`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-pix_fmt',
    'yuv420p',
    // Two threads: this shares a small machine with the app itself, and a
    // clip that takes twice as long is better than a workshop that stalls.
    '-threads',
    '2',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-movflags',
    '+faststart',
    '-y',
    outputPath,
  ]
}

async function probeSize(
  inputPath: string,
  container: VideoContainer
): Promise<{ width: number; height: number } | null> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-protocol_whitelist',
        'file,crypto',
        '-f',
        ffmpegInputFormat(container),
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height',
        '-of',
        'csv=p=0:s=x',
        inputPath,
      ],
      { timeout: PROBE_TIMEOUT_MS }
    )
    return parseProbedSize(stdout)
  } catch {
    return null
  }
}

export interface DownscaleJob {
  attachmentId: string
  organizationId: string
  /** The attachment's URL as it was saved: `/api/protected/files/<org>/services/<name>`. */
  fileUrl: string
  container: VideoContainer
}

const FOLDER = 'services'

async function run(job: DownscaleJob): Promise<void> {
  const name = job.fileUrl.split('/').pop()
  if (!name) return
  const dir = path.join(uploadsRoot(), job.organizationId, FOLDER)
  const inputPath = path.join(dir, name)

  const size = await probeSize(inputPath, job.container)
  if (!size || !needsDownscale(size.width, size.height)) return

  const outputName = `${crypto.randomUUID()}.mp4`
  const outputPath = path.join(dir, outputName)

  let fileSize: number
  try {
    await execFileAsync('ffmpeg', downscaleArgs(inputPath, job.container, outputPath), {
      timeout: ENCODE_TIMEOUT_MS,
    })
    fileSize = (await stat(outputPath)).size
  } catch {
    // Whatever ffmpeg left behind is half a file that no row points at.
    await discardUnsavedUpload(job.organizationId, FOLDER, outputName)
    return
  }

  // Only if the row still points at the file that was re-encoded. An
  // attachment deleted while this ran must not come back as a file on disk.
  const swapped = await db.serviceAttachment.updateMany({
    where: { id: job.attachmentId, fileUrl: job.fileUrl },
    data: {
      fileUrl: `/api/protected/files/${job.organizationId}/${FOLDER}/${outputName}`,
      fileType: 'video/mp4',
      fileSize,
    },
  })
  if (swapped.count === 0) {
    await discardUnsavedUpload(job.organizationId, FOLDER, outputName)
    return
  }

  // Through the file manager, not deleted outright: it checks that no other
  // row picked the original up in the minutes this took.
  await releaseFiles([job.fileUrl], {
    organizationId: job.organizationId,
    reason: 'video replaced by its 1080p copy',
  })
}

// On globalThis, so the one queue survives a module being loaded twice.
const state = globalThis as unknown as { __videoDownscaleQueue?: Promise<void> }

/**
 * Queues a saved video to be checked and, when it is above 1080p, re-encoded.
 *
 * One at a time. Two 4K encodes side by side on the machine that also serves
 * the workshop is how an upload turns into an outage.
 */
export function queueVideoDownscale(job: DownscaleJob): Promise<void> {
  const next = (state.__videoDownscaleQueue ?? Promise.resolve()).then(() =>
    run(job).catch((err) => {
      console.error(`[video] could not downscale attachment ${job.attachmentId}:`, err)
    })
  )
  state.__videoDownscaleQueue = next
  return next
}
