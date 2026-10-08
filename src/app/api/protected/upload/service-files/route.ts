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
import { assertContentLength } from '@/lib/backup/zip-guard'
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

// The multipart framing around the file adds a little to the body. The
// margin keeps a file just under the cap from being refused for it.
const MAX_BODY = MAX_SIZE + 1024 * 1024

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

  // Refused from the header, before the body is buffered into memory.
  try {
    assertContentLength(request, MAX_BODY)
  } catch {
    return NextResponse.json({ error: 'File size must be under 500MB' }, { status: 413 })
  }

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

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File size must be under 500MB' }, { status: 400 })
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

  const ext = container ? 'mp4' : extensionForType(file.type)
  const filename = `${crypto.randomUUID()}.${ext}`
  const uploadDir = path.join(uploadsRoot(), ctx.organizationId, 'services')

  await mkdir(uploadDir, { recursive: true })

  const finalPath = path.join(uploadDir, filename)

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

    // The original is never kept in place of a failed encode: its bytes
    // were only checked at the start, and are not what would be served.
    if (!compressed) {
      await discardUnsavedUpload(ctx.organizationId, 'services', filename)
      return NextResponse.json(
        { error: 'The video could not be processed. Try another file or format.' },
        { status: 422 }
      )
    }
  } else {
    await writeFile(finalPath, bytes)
  }

  const finalStat = await stat(finalPath)

  return NextResponse.json({
    url: `/api/protected/files/${ctx.organizationId}/services/${filename}`,
    fileName: file.name,
    fileType: container ? 'video/mp4' : file.type,
    fileSize: finalStat.size,
  })
}
