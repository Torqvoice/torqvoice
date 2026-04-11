import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { readFile, stat } from 'fs/promises'
import path from 'path'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
}

export async function GET(_request: Request, { params }: { params: Promise<{ orgId: string }> }) {
  const { orgId: orgParam } = await params

  // Accept either slug or UUID
  const resolvedOrg = await resolvePortalOrg(orgParam)
  const orgId = resolvedOrg?.id ?? orgParam

  const setting = await db.appSetting.findUnique({
    where: {
      organizationId_key: {
        organizationId: orgId,
        key: SETTING_KEYS.PORTAL_BACKGROUND_IMAGE,
      },
    },
    select: { value: true },
  })

  if (!setting?.value) {
    return NextResponse.json({ error: 'No background' }, { status: 404 })
  }

  const urlParts = setting.value.split('/')
  const filename = urlParts[urlParts.length - 1]

  if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'Invalid' }, { status: 400 })
  }

  const filePath = path.join(process.cwd(), 'data', 'uploads', orgId, 'portal', filename)

  try {
    await stat(filePath)
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const buffer = await readFile(filePath)
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  const contentType = MIME_TYPES[ext] || 'image/png'

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
