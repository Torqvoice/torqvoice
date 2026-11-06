import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCachedMembership } from '@/lib/cached-session'
import { getAuthContext } from '@/lib/get-auth-context'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { sharedWaveformFile } from '@/features/fault-codes/Lib/service.server'

const paramsSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['psdata', 'pssettings', 'csv', 'image']),
})

/**
 * One file of a shared waveform, from the code service: a published one's, or this
 * workshop's own while it waits for review. The recording and the settings download under
 * the name they were shared with, to open in PicoScope; the picture shows in the page
 * (`?size=thumb` for the small one). Streamed through; nothing is kept here.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; role: string }> }
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
  const size =
    parsed.data.role === 'image' && request.nextUrl.searchParams.get('size') === 'thumb'
      ? 'thumb'
      : 'full'
  const file = await sharedWaveformFile(ctx.organizationId, { ...parsed.data, size })
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const headers: Record<string, string> = {
    'Content-Type': parsed.data.role === 'image' ? 'image/jpeg' : file.contentType,
    'Cache-Control': 'private, max-age=86400',
    'X-Content-Type-Options': 'nosniff',
  }
  if (parsed.data.role !== 'image' && file.disposition) {
    headers['Content-Disposition'] = file.disposition
  }
  if (file.length) headers['Content-Length'] = String(file.length)
  return new Response(file.body, { headers })
}
