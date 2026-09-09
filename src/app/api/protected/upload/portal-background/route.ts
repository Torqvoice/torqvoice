import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { cleanImage } from '@/lib/image-upload.server'
import { resolveUploadPath } from '@/lib/resolve-upload-path'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext()

    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return NextResponse.json({ error: 'Upload a PNG, JPEG or WebP image' }, { status: 400 })
    }

    // Backgrounds are allowed to be larger than logos.
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 8MB' }, { status: 400 })
    }

    // Decoded and re-encoded: the stored file holds pixels and nothing else,
    // and its extension is what the bytes turned out to be, not the name.
    let clean: Awaited<ReturnType<typeof cleanImage>>
    try {
      clean = await cleanImage(Buffer.from(await file.arrayBuffer()), { maxSide: 2560 })
    } catch {
      return NextResponse.json({ error: 'Not an image we can read' }, { status: 400 })
    }

    const fileName = `${randomUUID()}.${clean.ext}`
    const uploadDir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, 'portal')

    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, fileName), clean.data)

    const url = `/api/protected/files/${ctx.organizationId}/portal/${fileName}`

    // Delete the previous background image if one exists.
    const previous = await db.appSetting.findFirst({
      where: {
        organizationId: ctx.organizationId,
        key: SETTING_KEYS.PORTAL_BACKGROUND_IMAGE,
      },
      select: { value: true },
    })
    if (previous?.value) {
      try {
        await unlink(resolveUploadPath(previous.value))
      } catch {
        // File may already be gone — best effort.
      }
    }

    return NextResponse.json({ url, fileName })
  } catch (error) {
    console.error('[Portal Background Upload] Error:', error)
    return NextResponse.json({ error: 'Failed to upload background' }, { status: 500 })
  }
}
