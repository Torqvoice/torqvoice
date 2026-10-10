import { NextRequest, NextResponse } from 'next/server'
import { extensionForType } from '@/lib/upload-url'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { uploadsRoot } from '@/lib/upload-root'
import { guardUpload, uploadLimit, uploadTooLargeMessage } from '@/lib/upload-guard'
import { isDeclaredVideo, NOT_A_VIDEO_MESSAGE, sniffDeclaredVideo } from '@/lib/video-sniff'

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

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const refused = guardUpload(request, MAX_SIZE)
    if (refused) return refused

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: 'File type not allowed. Supported: JPEG, PNG, WebP, PDF, CSV, TXT, MP4, WebM, MOV',
        },
        { status: 400 }
      )
    }

    const maxBytes = uploadLimit(MAX_SIZE)
    if (file.size > maxBytes) {
      return NextResponse.json({ error: uploadTooLargeMessage(maxBytes) }, { status: 400 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())

    // A video is stored and served as one only when its bytes are the
    // container its declared type promises.
    if (isDeclaredVideo(file.type) && !sniffDeclaredVideo(file.type, bytes)) {
      return NextResponse.json({ error: NOT_A_VIDEO_MESSAGE }, { status: 400 })
    }

    const ext = extensionForType(file.type)
    const filename = `${crypto.randomUUID()}.${ext}`
    const uploadDir = path.join(uploadsRoot(), ctx.organizationId, 'quotes')

    await mkdir(uploadDir, { recursive: true })

    await writeFile(path.join(uploadDir, filename), bytes)

    return NextResponse.json({
      url: `/api/protected/files/${ctx.organizationId}/quotes/${filename}`,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
    })
  } catch (error) {
    console.error('[Upload/QuoteFiles] Error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
