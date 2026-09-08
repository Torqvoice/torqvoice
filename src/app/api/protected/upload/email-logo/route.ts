import { randomUUID } from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'
import sharp from 'sharp'
import { EMAIL_LOGO_CATEGORY, EMAIL_LOGO_MAX_WIDTH } from '@/features/email/Lib/emailTemplate'
import { getAuthContext } from '@/lib/get-auth-context'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getCachedMembership } from '@/lib/cached-session'

/**
 * A logo for the email templates, uploaded on its own rather than borrowed
 * from the company settings.
 *
 * Mail clients are unkind to logos: no scaling to fit, no SVG, and Outlook
 * draws an image at the pixel size it was saved at. So the upload is made
 * clean here once: trimmed of transparent margins, fitted to twice the
 * largest width a template can ask for (so it stays sharp on a phone), and
 * written as PNG so transparency survives. What the template stores is the
 * protected URL; the public route serves the same file to mail clients.
 */
export async function POST(request: Request) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const isOwnerOrAdmin = ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'super_admin'
  if (!isOwnerOrAdmin) {
    const membership = await getCachedMembership(ctx.userId)
    if (membership?.roleId) {
      const permissions = membership.customRole?.permissions ?? []
      const canEdit = hasPermission(permissions, {
        action: PermissionAction.UPDATE,
        subject: PermissionSubject.SETTINGS,
      })
      if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const formData = await request.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return NextResponse.json({ error: 'Upload a PNG, JPEG or WebP image' }, { status: 400 })
  }
  if (file.size > 4 * 1024 * 1024) {
    return NextResponse.json({ error: 'File size must be under 4MB' }, { status: 400 })
  }

  try {
    const source = Buffer.from(await file.arrayBuffer())
    const image = sharp(source, { failOn: 'error' }).rotate()
    const meta = await image.metadata()
    if (!meta.width || !meta.height) {
      return NextResponse.json({ error: 'Not an image we can read' }, { status: 400 })
    }

    const png = await image
      .trim({ threshold: 8 })
      .resize({
        width: EMAIL_LOGO_MAX_WIDTH * 2,
        height: 400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })

    const fileName = `${randomUUID()}.png`
    const dir = path.join(process.cwd(), 'data', 'uploads', ctx.organizationId, EMAIL_LOGO_CATEGORY)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), png.data)

    return NextResponse.json({
      url: `/api/protected/files/${ctx.organizationId}/${EMAIL_LOGO_CATEGORY}/${fileName}`,
      width: png.info.width,
      height: png.info.height,
    })
  } catch (error) {
    console.error('[Email logo upload] Error:', error)
    return NextResponse.json({ error: 'Could not process the image' }, { status: 500 })
  }
}
