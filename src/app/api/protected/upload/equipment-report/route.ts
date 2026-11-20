import crypto from 'crypto'
import { mkdir, writeFile } from 'fs/promises'
import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { equipmentEnabled } from '@/features/equipment/Lib/equipmentGate.server'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { getCachedMembership } from '@/lib/cached-session'
import { getAuthContext } from '@/lib/get-auth-context'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { uploadsRoot } from '@/lib/upload-root'
import { extensionForType } from '@/lib/upload-url'

const MAX_SIZE = 20 * 1024 * 1024

/** What an examination report arrives as, told from its first bytes, not its name. */
const SIGNATURES: { type: string; ext: string; test: (b: Uint8Array) => boolean }[] = [
  {
    type: 'application/pdf',
    ext: 'pdf',
    test: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  { type: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: 'image/png',
    ext: 'png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: 'image/webp',
    ext: 'webp',
    test: (b) => b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57,
  },
]

/**
 * The examination report of a piece of equipment: a PDF or a photo of the
 * certificate. Stored with the vehicle's files; the item points at it, and
 * src/lib/files/manager.ts deletes it when the item goes or the report is
 * replaced. Only for a workshop that uses equipment.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const membership = ctx.isSuperAdmin ? null : await getCachedMembership(ctx.userId)
  const allowed =
    ctx.isAdmin ||
    hasPermission(membership?.customRole?.permissions ?? [], {
      action: PermissionAction.UPDATE,
      subject: PermissionSubject.VEHICLES,
    })
  if (!allowed) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (isRestoring(ctx.organizationId)) {
    return NextResponse.json({ error: RESTORE_IN_PROGRESS_MESSAGE }, { status: 409 })
  }
  if (!(await equipmentEnabled(ctx.organizationId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  try {
    assertContentLength(request, MAX_SIZE + 1024 * 1024)
  } catch {
    return NextResponse.json({ error: 'File size must be under 20MB' }, { status: 413 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File size must be under 20MB' }, { status: 413 })
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const kind = SIGNATURES.find((s) => s.test(bytes))
  if (!kind) {
    return NextResponse.json({ error: 'Only PDF, JPEG, PNG and WebP files' }, { status: 400 })
  }

  const filename = `${crypto.randomUUID()}.${extensionForType(kind.type, kind.ext)}`
  const dir = path.join(uploadsRoot(), ctx.organizationId, 'vehicles')
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, filename), bytes)
  const name = (file.name || filename).replace(/[\r\n]/g, ' ').slice(0, 200)
  return NextResponse.json({
    url: `/api/protected/files/${ctx.organizationId}/vehicles/${filename}`,
    name,
  })
}
