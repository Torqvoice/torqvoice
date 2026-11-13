import { NextResponse } from 'next/server'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { db } from '@/lib/db'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { compressPhoto } from '@/lib/image-upload.server'
import { verifyVehicleHandoffToken } from '@/lib/photo-handoff'
import { rateLimit } from '@/lib/rate-limit'
import { uploadsRoot } from '@/lib/upload-root'
import { discardUnsavedUpload, releaseFiles } from '@/lib/files/manager'

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
/** What a phone camera sends before compression. */
const MAX_BYTES = 15 * 1024 * 1024
/** The photo heads the vehicle's page, so it keeps more detail than a job photo. */
const MAX_SIDE = 1600
const RATE_PER_MINUTE = 20

function refuse(status: number, code: string) {
  return NextResponse.json({ code }, { status })
}

/**
 * The photo from the phone page a vehicle's "Add from phone" code opens.
 * Nobody is signed in: the signed code is the permission, and all it can do is
 * set that one vehicle's photo. The photo is compressed, stored where the
 * vehicle form puts its photos, and the one it replaces goes to the file
 * manager, which keeps it if anything else still shows it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, { limit: RATE_PER_MINUTE, windowMs: 60_000, anonymous: true })
  if (limited) return limited

  const { token } = await params
  const check = verifyVehicleHandoffToken(token)
  if (!check.ok) return refuse(check.reason === 'expired' ? 410 : 404, check.reason)
  const { organizationId, vehicleId } = check.handoff
  // No session here, so the restore freeze is checked on the route itself.
  if (isRestoring(organizationId)) {
    return NextResponse.json(
      { code: 'restoring', error: RESTORE_IN_PROGRESS_MESSAGE },
      { status: 409 }
    )
  }

  const vehicle = await db.vehicle.findFirst({
    where: { id: vehicleId, organizationId },
    select: { id: true, imageUrl: true },
  })
  if (!vehicle) return refuse(404, 'invalid')

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return refuse(400, 'noFile')
  if (!PHOTO_TYPES.has(file.type)) return refuse(400, 'type')
  if (file.size === 0) return refuse(400, 'empty')
  if (file.size > MAX_BYTES) return refuse(400, 'tooLarge')

  let jpeg: Buffer
  try {
    const photo = await compressPhoto(Buffer.from(await file.arrayBuffer()), MAX_SIDE)
    jpeg = photo.data
  } catch {
    return refuse(400, 'type')
  }

  const filename = `${crypto.randomUUID()}.jpg`
  const dir = path.join(uploadsRoot(), organizationId, 'vehicles')
  const stored = path.join(dir, filename)
  await mkdir(dir, { recursive: true })
  await writeFile(stored, jpeg)
  const imageUrl = `/api/protected/files/${organizationId}/vehicles/${filename}`

  const updated = await db.vehicle.updateMany({
    where: { id: vehicle.id, organizationId },
    data: { imageUrl },
  })
  if (updated.count === 0) {
    // Deleted while the photo was on its way: nothing shows the new file.
    await discardUnsavedUpload(organizationId, 'vehicles', filename)
    return refuse(404, 'invalid')
  }
  if (vehicle.imageUrl && vehicle.imageUrl !== imageUrl) {
    await releaseFiles([vehicle.imageUrl], { organizationId, reason: 'vehicle image replaced' })
  }
  return NextResponse.json({ ok: true })
}
