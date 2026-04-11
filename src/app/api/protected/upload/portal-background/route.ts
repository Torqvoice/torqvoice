import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
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

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    // Backgrounds are allowed to be larger than logos.
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 8MB' }, { status: 400 })
    }

    const ext = file.name.split('.').pop() || 'png'
    const fileName = `${randomUUID()}.${ext}`
    const uploadDir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, 'portal')

    await mkdir(uploadDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(path.join(uploadDir, fileName), buffer)

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
