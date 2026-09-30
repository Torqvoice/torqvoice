import { NextRequest, NextResponse } from 'next/server'
import { extensionForType } from '@/lib/upload-url'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import { uploadsRoot } from '@/lib/upload-root'
import { guardUpload, uploadLimit, uploadTooLargeMessage } from '@/lib/upload-guard'

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const refused = guardUpload(request, MAX_UPLOAD_BYTES)
    if (refused) return refused

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Only JPEG, PNG, WebP, and AVIF images are allowed' },
        { status: 400 }
      )
    }

    const maxBytes = uploadLimit(MAX_UPLOAD_BYTES)
    if (file.size > maxBytes) {
      return NextResponse.json({ error: uploadTooLargeMessage(maxBytes) }, { status: 400 })
    }

    const ext = extensionForType(file.type, 'jpg')
    const filename = `${crypto.randomUUID()}.${ext}`
    const uploadDir = path.join(uploadsRoot(), ctx.organizationId, 'vehicles')

    await mkdir(uploadDir, { recursive: true })

    const bytes = new Uint8Array(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, filename), bytes)

    return NextResponse.json({
      url: `/api/protected/files/${ctx.organizationId}/vehicles/${filename}`,
    })
  } catch (error) {
    console.error('[Upload] Error:', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
