import { NextResponse } from 'next/server'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { compressPhoto } from '@/lib/image-upload.server'
import { verifyFixHandoffToken } from '@/lib/photo-handoff'
import { rateLimit } from '@/lib/rate-limit'
import { addDraftPhoto, listDraftPhotos } from '@/features/fault-codes/Lib/fixDrafts.server'
import { MAX_FIX_PHOTOS, MAX_WAVEFORM_PHOTOS } from '@/features/fault-codes/Schema/faultCodeSchema'

/** A fix takes up to four photos; a waveform one picture of the scope screen. */
const maxFor = (purpose: 'fix' | 'waveform') =>
  purpose === 'waveform' ? MAX_WAVEFORM_PHOTOS : MAX_FIX_PHOTOS

const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
/** What a phone camera sends before compression. */
const MAX_BYTES = 15 * 1024 * 1024
const RATE_PER_MINUTE = 30

function refuse(status: number, code: string) {
  return NextResponse.json({ code }, { status })
}

/**
 * A photo from the phone page a fix's "Add from phone" code opens. Nobody is
 * signed in: the signed code is the permission, and it only reaches that
 * fix's draft, which holds at most four photos. The photo is compressed as
 * job photos are and kept until the fix is shared (lib: fixDrafts.server).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = rateLimit(request, { limit: RATE_PER_MINUTE, windowMs: 60_000, anonymous: true })
  if (limited) return limited

  const { token } = await params
  const check = verifyFixHandoffToken(token)
  if (!check.ok) return refuse(check.reason === 'expired' ? 410 : 404, check.reason)
  const { organizationId, draftId, purpose } = check.handoff
  const max = maxFor(purpose)
  // No session here, so the restore freeze is checked on the route itself.
  if (isRestoring(organizationId)) {
    return NextResponse.json(
      { code: 'restoring', error: RESTORE_IN_PROGRESS_MESSAGE },
      { status: 409 }
    )
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return refuse(400, 'noFile')
  if (!PHOTO_TYPES.has(file.type)) return refuse(400, 'type')
  if (file.size === 0) return refuse(400, 'empty')
  if (file.size > MAX_BYTES) return refuse(400, 'tooLarge')

  let jpeg: Uint8Array
  try {
    const photo = await compressPhoto(Buffer.from(await file.arrayBuffer()))
    jpeg = new Uint8Array(photo.data)
  } catch {
    return refuse(400, 'type')
  }
  const added = await addDraftPhoto(organizationId, draftId, jpeg, max)
  if (!added) return refuse(409, 'limit')
  return NextResponse.json({ count: added.count, max })
}

/** How many photos the draft holds, so a reopened phone page starts right. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const check = verifyFixHandoffToken(token)
  if (!check.ok) return refuse(check.reason === 'expired' ? 410 : 404, check.reason)
  const photos = await listDraftPhotos(check.handoff.organizationId, check.handoff.draftId)
  return NextResponse.json({ count: photos.length, max: maxFor(check.handoff.purpose) })
}
