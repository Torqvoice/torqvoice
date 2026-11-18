import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { db } from '@/lib/db'
import { getCachedSession } from '@/lib/cached-session'
import { sessionOrganizationScope } from '@/lib/session-scope'
import { installHasLicense, isCloudMode } from '@/lib/features'
import { demoGuard } from '@/lib/demo'
import { cleanImage } from '@/lib/image-upload.server'
import { appIconUrl, brandingDir, invalidateAppBranding, isSafeIconFileName } from '@/lib/branding'
import { releaseInstallFile } from '@/lib/files/manager'
import { SYSTEM_SETTING_KEYS } from '@/features/admin/Schema/systemSettingsSchema'

/** Square, and large enough for every place a browser shows an app icon. */
const ICON_SIDE = 512

/**
 * The install's app icon, set from the admin panel. The same gate as
 * `withSuperAdmin`, and only where the branding is honoured at all: a licensed
 * self-hosted install.
 */
async function refusal(): Promise<NextResponse | null> {
  const session = await getCachedSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { isSuperAdmin: true },
  })
  // A session a workshop minted without a password carries no platform rights.
  if (!user?.isSuperAdmin || sessionOrganizationScope(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (isCloudMode() || !(await installHasLicense())) {
    return NextResponse.json(
      { error: 'A white-label licence is required to change the app icon' },
      { status: 403 }
    )
  }

  try {
    demoGuard()
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 403 })
  }

  return null
}

async function currentIconFileName(): Promise<string | null> {
  const row = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.BRANDING_APP_ICON },
    select: { value: true },
  })
  const value = row?.value?.trim()
  return value || null
}

/** Moves a stored icon to the trash. Only names we could have written are touched. */
async function removeIconFile(fileName: string | null) {
  if (!fileName || !isSafeIconFileName(fileName)) return
  await releaseInstallFile('branding', fileName)
}

export async function POST(request: Request) {
  try {
    const refused = await refusal()
    if (refused) return refused

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return NextResponse.json({ error: 'Upload a PNG, JPEG or WebP image' }, { status: 400 })
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File size must be under 2MB' }, { status: 400 })
    }

    // cleanImage is the safety check (decoded, re-encoded, no SVG). It only
    // fits inside a box, so the result is then centred on a transparent
    // square PNG: the manifest declares 512x512 and iOS wants a square.
    let data: Buffer
    try {
      const clean = await cleanImage(Buffer.from(await file.arrayBuffer()), { maxSide: ICON_SIDE })
      data = await sharp(clean.data)
        .resize({
          width: ICON_SIDE,
          height: ICON_SIDE,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer()
    } catch {
      return NextResponse.json({ error: 'Not an image we can read' }, { status: 400 })
    }

    const fileName = `${randomUUID()}.png`
    const dir = brandingDir()
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, fileName), data)

    const previous = await currentIconFileName()
    await db.systemSetting.upsert({
      where: { key: SYSTEM_SETTING_KEYS.BRANDING_APP_ICON },
      create: { key: SYSTEM_SETTING_KEYS.BRANDING_APP_ICON, value: fileName },
      update: { value: fileName },
    })
    // Install-owned, outside every workshop's folder, but the file manager
    // still does the moving so the old icon waits in the trash like any
    // other released file.
    if (previous !== fileName) await removeIconFile(previous)

    invalidateAppBranding()

    return NextResponse.json({ fileName, url: appIconUrl(fileName) })
  } catch (error) {
    console.error('[App Icon Upload] Error:', error)
    return NextResponse.json({ error: 'Failed to upload the app icon' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const refused = await refusal()
    if (refused) return refused

    const previous = await currentIconFileName()
    await db.systemSetting.deleteMany({ where: { key: SYSTEM_SETTING_KEYS.BRANDING_APP_ICON } })
    await removeIconFile(previous)

    invalidateAppBranding()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[App Icon Delete] Error:', error)
    return NextResponse.json({ error: 'Failed to remove the app icon' }, { status: 500 })
  }
}
