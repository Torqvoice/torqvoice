import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isRestoring, RESTORE_IN_PROGRESS_MESSAGE } from '@/lib/backup/freeze'
import { assertContentLength } from '@/lib/backup/zip-guard'
import { getCachedMembership } from '@/lib/cached-session'
import { isDemoMode } from '@/lib/demo'
import { getAuthContext } from '@/lib/get-auth-context'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { locales } from '@/i18n/config'
import { discardDraft, readDraftPhotos } from '@/features/fault-codes/Lib/fixDrafts.server'
import { fixMakesFor } from '@/features/fault-codes/Lib/codes'
import { shareFix, vehicleForCodes } from '@/features/fault-codes/Lib/service.server'
import type { FaultCodeVehicle } from '@/features/integrations/Lib/types'
import {
  FIX_PHOTO_TYPES,
  MAX_FIX_PHOTO_BYTES,
  MAX_FIX_PHOTOS,
  shareFixSchema,
} from '@/features/fault-codes/Schema/faultCodeSchema'

/** Four photos at their limit and room for the rest of the form. */
const MAX_BODY = MAX_FIX_PHOTOS * MAX_FIX_PHOTO_BYTES + 1024 * 1024

/**
 * Why sharing did not go through, as a code the form turns into words.
 * `unavailable`: not connected, or the code service did not answer.
 */
export type ShareFixError =
  | 'unauthorized'
  | 'forbidden'
  | 'demo'
  | 'restoring'
  | 'invalid'
  | 'photo'
  | 'too_large'
  | 'paused'
  | 'unavailable'

function fail(status: number, error: ShareFixError, message?: string) {
  return NextResponse.json({ success: false, error, message }, { status })
}

/**
 * "Share your fix" from a fault code's page: what fixed it, the vehicle and
 * up to four photos the browser has already compressed. Checks who is
 * asking, the sizes and that the code service is connected, then sends it
 * all on to the service, which keeps it for a person to review. Nothing is
 * written to this server's disk or database but the fix's id, kept in the
 * connection's link store so the page can show how the review stands.
 *
 * A route rather than a server action because it carries photos.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return fail(401, 'unauthorized')
  // The same permission as reporting a wrong meaning.
  const membership = ctx.isAdmin ? null : await getCachedMembership(ctx.userId)
  const allowed =
    ctx.isAdmin ||
    hasPermission(membership?.customRole?.permissions ?? [], {
      action: PermissionAction.UPDATE,
      subject: PermissionSubject.VEHICLES,
    })
  if (!allowed) return fail(403, 'forbidden')
  // The public demo shares nothing with other workshops.
  if (isDemoMode) return fail(403, 'demo')
  if (isRestoring(ctx.organizationId)) return fail(409, 'restoring', RESTORE_IN_PROGRESS_MESSAGE)
  try {
    assertContentLength(request, MAX_BODY)
  } catch {
    return fail(413, 'too_large')
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, 'invalid')
  }
  const text = (name: string) => {
    const value = form.get(name)
    return typeof value === 'string' ? value : undefined
  }
  const parsed = shareFixSchema.safeParse({
    code: text('code'),
    meaning: text('meaning') || undefined,
    text: text('text'),
    vehicleId: text('vehicleId') || undefined,
    draftId: text('draftId') || undefined,
    make: text('make'),
    model: text('model'),
    year: text('year'),
  })
  const lang = z.enum(locales).safeParse(text('lang'))
  if (!parsed.success || !lang.success) return fail(400, 'invalid')
  const data = parsed.data

  const photos = form.getAll('photo')
  if (photos.length > MAX_FIX_PHOTOS) return fail(400, 'photo')
  const files: Blob[] = []
  for (const photo of photos) {
    if (!(photo instanceof File)) return fail(400, 'photo')
    if (!(FIX_PHOTO_TYPES as readonly string[]).includes(photo.type)) return fail(400, 'photo')
    if (photo.size > MAX_FIX_PHOTO_BYTES) return fail(413, 'too_large')
    files.push(photo)
  }
  // Photos a phone added to this fix's draft, already compressed on the way in.
  if (data.draftId) {
    const fromPhone = await readDraftPhotos(ctx.organizationId, data.draftId)
    if (files.length + fromPhone.length > MAX_FIX_PHOTOS) return fail(400, 'photo')
    for (const jpeg of fromPhone)
      files.push(new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }))
  }

  // Opened from a job: the vehicle's make, model, year and engine, read here
  // and scoped by the workshop. Otherwise what was typed, all of it optional.
  let vehicle: FaultCodeVehicle | null = null
  if (data.vehicleId) {
    const known = await vehicleForCodes(ctx.organizationId, data.vehicleId)
    if (known) {
      vehicle = { make: known.make, model: known.model, year: known.year, engine: known.engine }
    }
  } else if (data.make || data.model || data.year) {
    vehicle = { make: data.make, model: data.model, year: data.year }
  }
  // A make's own code is only on that make's cars: a BMW code on a Toyota is a typo.
  const makes = fixMakesFor(data.code)
  if (makes && vehicle?.make && !makes.some((m) => m.toLowerCase() === vehicle.make?.toLowerCase()))
    return fail(400, 'invalid')
  // Only a make's own code has meanings to tell apart.
  if (data.meaning && !makes) return fail(400, 'invalid')

  const result = await shareFix(ctx.organizationId, {
    code: data.code,
    meaning: data.meaning,
    text: data.text,
    lang: lang.data,
    vehicle,
    photos: files,
  })
  if (result.ok) {
    if (data.draftId) await discardDraft(ctx.organizationId, data.draftId)
    return NextResponse.json({ success: true, data: result.fix })
  }
  switch (result.reason) {
    case 'photo':
      return fail(400, 'photo')
    case 'invalid':
      return fail(400, 'invalid')
    case 'too_large':
      return fail(413, 'too_large')
    case 'paused':
      return fail(503, 'paused')
    default:
      return fail(503, 'unavailable')
  }
}
