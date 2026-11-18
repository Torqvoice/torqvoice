import crypto from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type NextRequest, NextResponse } from 'next/server'
import {
  PORTAL_PHOTO_MAX_BYTES,
  PORTAL_PHOTO_TYPES,
  PORTAL_UPLOAD_FOLDER,
} from '@/features/portal/Lib/portalUploads'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { getAuthContext } from '@/lib/get-auth-context'
import { compressPhoto } from '@/lib/image-upload.server'
import { guardUpload, uploadLimit } from '@/lib/upload-guard'
import { uploadsRoot } from '@/lib/upload-root'

/**
 * A photo the workshop sends a customer in the portal's chat, from the
 * Messages inbox. Stored in the same folder as what customers send
 * (`<org>/portal-uploads/`), because that is the folder a customer's file
 * route reads from; the customer can open it once a message to them
 * mentions it.
 *
 * Photos only, saved again as a JPEG no larger than 1600 px whatever
 * arrives, like a customer's own.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // While a restore replaces this workshop's rows and files, nothing is written here.
    if (isRestoring(ctx.organizationId)) {
      return NextResponse.json({ error: RESTORE_IN_PROGRESS_MESSAGE }, { status: 409 })
    }

    // Paced, and refused on the declared length before the body is buffered.
    const refused = guardUpload(request, PORTAL_PHOTO_MAX_BYTES)
    if (refused) return refused

    const file = (await request.formData()).get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (!(PORTAL_PHOTO_TYPES as readonly string[]).includes(file.type.toLowerCase())) {
      return NextResponse.json({ error: 'Only photos can be sent' }, { status: 400 })
    }
    if (file.size === 0 || file.size > uploadLimit(PORTAL_PHOTO_MAX_BYTES)) {
      return NextResponse.json({ error: 'The photo is too large' }, { status: 400 })
    }

    let photo: Awaited<ReturnType<typeof compressPhoto>>
    try {
      photo = await compressPhoto(Buffer.from(await file.arrayBuffer()), 1600)
    } catch {
      return NextResponse.json({ error: 'That file is not a photo' }, { status: 400 })
    }

    const name = `${crypto.randomUUID()}.jpg`
    const folder = path.join(uploadsRoot(), ctx.organizationId, PORTAL_UPLOAD_FOLDER)
    await mkdir(folder, { recursive: true })
    await writeFile(path.join(folder, name), photo.data)

    return NextResponse.json({
      url: `/api/protected/files/${ctx.organizationId}/${PORTAL_UPLOAD_FOLDER}/${name}`,
    })
  } catch (error) {
    console.error('[upload/portal-message]', error)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
