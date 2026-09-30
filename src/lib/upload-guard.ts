import { NextResponse } from 'next/server'
import { isDemoMode } from '@/lib/demo'
import { rateLimit } from '@/lib/rate-limit'

/**
 * The checks every upload route makes before it reads a byte of the body.
 *
 * `request.formData()` buffers the whole request, so a size check on the file
 * afterwards comes too late: the memory is already spent. The declared length
 * is checked first, and the caller's pace is capped. On the public demo, where
 * anybody can sign in, uploads are also capped far lower, since a video is
 * transcoded inline and every upload lands on a host other deploys share.
 */

/** Largest upload the public demo takes, whatever the route allows elsewhere. */
export const DEMO_MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Uploads per minute, per caller and route. A drop-off walk round is a few dozen photos. */
const UPLOADS_PER_MINUTE = isDemoMode ? 20 : 120

/** Multipart framing around the file itself. */
const FORM_OVERHEAD_BYTES = 64 * 1024

/** The route's own limit, lowered on the demo. */
export function uploadLimit(routeMaxBytes: number): number {
  return isDemoMode ? Math.min(routeMaxBytes, DEMO_MAX_UPLOAD_BYTES) : routeMaxBytes
}

/**
 * What a refused upload is told, naming the limit that actually applied. On
 * the demo that is the lowered one, so a route's own "under 500MB" would be
 * a lie there.
 */
export function uploadTooLargeMessage(maxBytes: number): string {
  return `File size must be under ${Math.round(maxBytes / (1024 * 1024))}MB`
}

/**
 * The size half of `guardUpload` alone, for a route that already limits its
 * callers its own way (the public handoff routes key on the address only).
 */
export function refuseDeclaredOversize(
  request: Request,
  routeMaxBytes: number
): NextResponse | null {
  const max = uploadLimit(routeMaxBytes)
  // A missing header reads as 0 here, which passes; the route's own check on
  // the file after reading still holds it to the same limit.
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > max + FORM_OVERHEAD_BYTES) {
    return NextResponse.json({ error: uploadTooLargeMessage(max) }, { status: 413 })
  }
  return null
}

/**
 * Null when the upload may be read, or the response that refuses it. Call it
 * before `request.formData()`, with the route's own limit.
 */
export function guardUpload(request: Request, routeMaxBytes: number): NextResponse | null {
  // Its own bucket, so a route that also limits its callers (the email
  // uploads do) does not count every request twice against one entry.
  const limited = rateLimit(request, {
    limit: UPLOADS_PER_MINUTE,
    windowMs: 60_000,
    bucket: 'upload',
  })
  if (limited) return limited

  return refuseDeclaredOversize(request, routeMaxBytes)
}
