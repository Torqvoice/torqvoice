import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'
import { APP_ICON_MIME_TYPES, brandingDir, isSafeIconFileName } from '@/lib/branding'
import { SYSTEM_SETTING_KEYS } from '@/features/admin/Schema/systemSettingsSchema'

/**
 * The install's own app icon. No sign-in: a browser fetches the favicon and
 * the home-screen icon before anyone has signed in. The `v` query the pages
 * add is only a cache-buster; which file is served comes from the setting.
 */
export async function GET() {
  const setting = await db.systemSetting.findUnique({
    where: { key: SYSTEM_SETTING_KEYS.BRANDING_APP_ICON },
    select: { value: true },
  })
  const fileName = setting?.value?.trim() ?? ''

  if (!fileName) {
    return NextResponse.json({ error: 'No icon' }, { status: 404 })
  }
  if (!isSafeIconFileName(fileName)) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  }

  const dir = brandingDir()
  const filePath = path.join(dir, fileName)
  // Belt and braces after the name check: never read outside the directory.
  if (path.dirname(filePath) !== dir) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    buffer = await readFile(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': APP_ICON_MIME_TYPES[ext],
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
