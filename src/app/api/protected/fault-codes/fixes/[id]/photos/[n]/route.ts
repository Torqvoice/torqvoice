import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCachedMembership } from '@/lib/cached-session'
import { getAuthContext } from '@/lib/get-auth-context'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { sharedFixPhoto } from '@/features/fault-codes/Lib/service.server'
import { MAX_FIX_PHOTOS } from '@/features/fault-codes/Schema/faultCodeSchema'

const paramsSchema = z.object({
  id: z.string().uuid(),
  n: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_FIX_PHOTOS - 1),
})

/**
 * One photo of a shared fix, from the code service: a published fix's, or
 * one of this workshop's own while it waits for review. `?size=thumb` for
 * the small one on a card. Streamed through; nothing is kept here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; n: string }> }
) {
  const ctx = await getAuthContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const membership = ctx.isAdmin ? null : await getCachedMembership(ctx.userId)
  const allowed =
    ctx.isAdmin ||
    hasPermission(membership?.customRole?.permissions ?? [], {
      action: PermissionAction.READ,
      subject: PermissionSubject.VEHICLES,
    })
  if (!allowed) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })

  const parsed = paramsSchema.safeParse(await params)
  if (!parsed.success) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const size = request.nextUrl.searchParams.get('size') === 'thumb' ? 'thumb' : 'full'

  const photo = await sharedFixPhoto(ctx.organizationId, { ...parsed.data, size })
  if (!photo) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const headers: Record<string, string> = {
    'Content-Type': 'image/jpeg',
    // A photo never changes once stored; this person's browser may keep it.
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  }
  if (photo.length) headers['Content-Length'] = String(photo.length)
  return new Response(photo.body, { headers })
}
