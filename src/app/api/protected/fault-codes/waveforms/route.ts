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
import { shareWaveform, vehicleForCodes } from '@/features/fault-codes/Lib/service.server'
import type {
  FaultCodeVehicle,
  FaultCodeWaveformInput,
  WaveformFileRole,
} from '@/features/integrations/Lib/types'
import {
  MAX_WAVEFORM_IMAGE_BYTES,
  MAX_WAVEFORM_RECORDING_BYTES,
  MAX_WAVEFORM_SETTINGS_BYTES,
  shareWaveformSchema,
} from '@/features/fault-codes/Schema/faultCodeSchema'

/** Each file at its limit and room for the rest of the form. */
const MAX_BODY =
  2 * MAX_WAVEFORM_RECORDING_BYTES +
  MAX_WAVEFORM_SETTINGS_BYTES +
  MAX_WAVEFORM_IMAGE_BYTES +
  1024 * 1024

const LIMITS: Record<WaveformFileRole, number> = {
  psdata: MAX_WAVEFORM_RECORDING_BYTES,
  csv: MAX_WAVEFORM_RECORDING_BYTES,
  pssettings: MAX_WAVEFORM_SETTINGS_BYTES,
  image: MAX_WAVEFORM_IMAGE_BYTES,
}

/** Why sharing did not go through, as a code the dialog turns into words. */
export type ShareWaveformError =
  | 'unauthorized'
  | 'forbidden'
  | 'demo'
  | 'restoring'
  | 'invalid'
  | 'photo'
  | 'csv'
  | 'too_large'
  | 'no_file'
  | 'paused'
  | 'unavailable'

function fail(status: number, error: ShareWaveformError, message?: string) {
  return NextResponse.json({ success: false, error, message }, { status })
}

/**
 * "Share a waveform" from a fault code's page: what it shows, known good or faulty, the car,
 * and whatever files the technician has (the recording, its settings, a CSV export, a picture
 * of the screen, or a photo from the phone). Sent on to the code service, which keeps it for a
 * person to review; only the waveform's id is kept here, for the page to show its review.
 *
 * A route rather than a server action because it carries files.
 */
export async function POST(request: NextRequest) {
  const ctx = await getAuthContext()
  if (!ctx) return fail(401, 'unauthorized')
  const membership = ctx.isAdmin ? null : await getCachedMembership(ctx.userId)
  const allowed =
    ctx.isAdmin ||
    hasPermission(membership?.customRole?.permissions ?? [], {
      action: PermissionAction.UPDATE,
      subject: PermissionSubject.VEHICLES,
    })
  if (!allowed) return fail(403, 'forbidden')
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
  const parsed = shareWaveformSchema.safeParse({
    code: text('code'),
    meaning: text('meaning') || undefined,
    kind: text('kind'),
    title: text('title'),
    condition: text('condition') || undefined,
    note: text('note') || undefined,
    vehicleId: text('vehicleId') || undefined,
    draftId: text('draftId') || undefined,
    make: text('make'),
    model: text('model'),
    year: text('year'),
  })
  const lang = z.enum(locales).safeParse(text('lang'))
  if (!parsed.success || !lang.success) return fail(400, 'invalid')
  const data = parsed.data

  const files: FaultCodeWaveformInput['files'] = []
  for (const role of ['psdata', 'pssettings', 'csv', 'image'] as const) {
    const file = form.get(role)
    if (file === null) continue
    if (!(file instanceof File) || file.size === 0) return fail(400, 'invalid')
    if (file.size > LIMITS[role]) return fail(413, 'too_large')
    files.push({ role, blob: file, name: file.name })
  }
  // A photo of the screen the phone took, already compressed on the way in.
  if (data.draftId && !files.some((f) => f.role === 'image')) {
    const [fromPhone] = await readDraftPhotos(ctx.organizationId, data.draftId)
    if (fromPhone) {
      files.push({
        role: 'image',
        blob: new Blob([new Uint8Array(fromPhone)], { type: 'image/jpeg' }),
        name: 'screen.jpg',
      })
    }
  }
  if (!files.some((f) => f.role !== 'pssettings')) return fail(400, 'no_file')

  let vehicle: FaultCodeVehicle | null = null
  if (data.vehicleId) {
    const known = await vehicleForCodes(ctx.organizationId, data.vehicleId)
    if (known) {
      vehicle = { make: known.make, model: known.model, year: known.year, engine: known.engine }
    }
  } else if (data.make || data.model || data.year) {
    vehicle = { make: data.make, model: data.model, year: data.year }
  }
  // A make's own code is only on that make's cars.
  const makes = fixMakesFor(data.code)
  if (makes && vehicle?.make && !makes.some((m) => m.toLowerCase() === vehicle.make?.toLowerCase()))
    return fail(400, 'invalid')
  if (data.meaning && !makes) return fail(400, 'invalid')

  const result = await shareWaveform(ctx.organizationId, {
    code: data.code,
    meaning: data.meaning,
    kind: data.kind,
    title: data.title,
    condition: data.condition,
    note: data.note,
    lang: lang.data,
    vehicle: vehicle ?? undefined,
    files,
  })
  if (result.ok) {
    if (data.draftId) await discardDraft(ctx.organizationId, data.draftId)
    return NextResponse.json({ success: true, data: result.waveform })
  }
  switch (result.reason) {
    case 'photo':
      return fail(400, 'photo')
    case 'invalid':
      // The service refuses a CSV that is not a scope export, or a file of the wrong kind.
      return fail(400, files.some((f) => f.role === 'csv') ? 'csv' : 'invalid')
    case 'too_large':
      return fail(413, 'too_large')
    case 'paused':
      return fail(503, 'paused')
    default:
      return fail(502, 'unavailable')
  }
}
