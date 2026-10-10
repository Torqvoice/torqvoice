import { NextRequest, NextResponse } from 'next/server'
import { extensionForType } from '@/lib/upload-url'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir, stat } from 'fs/promises'
import { discardUnsavedUpload } from '@/lib/files/manager'
import path from 'path'
import crypto from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { uploadsRoot } from '@/lib/upload-root'
import { guardUpload, uploadLimit, uploadTooLargeMessage } from '@/lib/upload-guard'
import {
  ffmpegInputFormat,
  isDeclaredVideo,
  NOT_A_VIDEO_MESSAGE,
  sniffDeclaredVideo,
  type VideoContainer,
} from '@/lib/video-sniff'

const execFileAsync = promisify(execFile)

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/csv',
  'text/plain',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

/**
 * Re-encodes a video whose container has already been checked from its
 * bytes. The input demuxer is pinned rather than guessed, so a playlist or
 * concat script can never be read as one, and only local files may be
 * opened. Subtitle and data streams are dropped and only the first video
 * and audio streams are kept, so nothing but picture and sound reaches the
 * output the uploader gets back.
 */
async function compressVideo(
  inputPath: string,
  container: VideoContainer,
  outputPath: string
): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
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
        'scale=-2:720', // Scale to 720p, keep aspect ratio
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '28', // Good quality/size balance
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart', // Web-optimized
        '-y', // Overwrite
        outputPath,
      ],
      { timeout: 300000 }
    ) // 5 min timeout
    return true
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()

  if (!ctx) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Before the body is read: at 500MB, buffering first and checking after is
  // the whole cost already paid, and a video is transcoded inline afterwards.
  const refused = guardUpload(request, MAX_SIZE)
  if (refused) return refused

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Supported: JPEG, PNG, WebP, PDF, CSV, TXT, MP4, WebM, MOV' },
      { status: 400 }
    )
  }

  const maxBytes = uploadLimit(MAX_SIZE)
  if (file.size > maxBytes) {
    return NextResponse.json({ error: uploadTooLargeMessage(maxBytes) }, { status: 400 })
  }

  const bytes = new Uint8Array(await file.arrayBuffer())

  // The declared type only says the client hopes this is a video. It is
  // treated as one when the bytes agree, and refused when they do not.
  let container: VideoContainer | null = null
  if (isDeclaredVideo(file.type)) {
    container = sniffDeclaredVideo(file.type, bytes)
    if (!container) {
      return NextResponse.json({ error: NOT_A_VIDEO_MESSAGE }, { status: 400 })
    }
  }

  // A video is re-encoded to MP4 when ffmpeg is there and manages it;
  // otherwise it is kept as it came, under the container it really holds.
  let ext = container ? 'mp4' : extensionForType(file.type)
  const baseName = crypto.randomUUID()
  let filename = `${baseName}.${ext}`
  const uploadDir = path.join(uploadsRoot(), ctx.organizationId, 'services')

  await mkdir(uploadDir, { recursive: true })

  let finalPath = path.join(uploadDir, filename)
  let storedType = file.type

  if (container) {
    // The original goes to a temporary file named for the container the
    // bytes hold, never the client's name, and is always removed after.
    const tempFilename = `${crypto.randomUUID()}_orig.${container}`
    const tempPath = path.join(uploadDir, tempFilename)
    let compressed = false
    try {
      await writeFile(tempPath, bytes)
      compressed = await compressVideo(tempPath, container, finalPath)
    } finally {
      await discardUnsavedUpload(ctx.organizationId, 'services', tempFilename)
    }

    if (compressed) {
      storedType = 'video/mp4'
    } else {
      // No ffmpeg on this install, or a take it could not read. The bytes
      // were checked to be the container they claim before anything ran,
      // and nothing has touched them since, so they are kept as they are:
      // a larger file, named and served as what it is, never as MP4.
      await discardUnsavedUpload(ctx.organizationId, 'services', filename)
      ext = container
      filename = `${baseName}.${ext}`
      finalPath = path.join(uploadDir, filename)
      storedType = `video/${container}`
      await writeFile(finalPath, bytes)
    }
  } else {
    await writeFile(finalPath, bytes)
  }

  const finalStat = await stat(finalPath)

  return NextResponse.json({
    url: `/api/protected/files/${ctx.organizationId}/services/${filename}`,
    fileName: file.name,
    fileType: storedType,
    fileSize: finalStat.size,
  })
}
