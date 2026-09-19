import 'server-only'

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { getFeatures } from '@/lib/features'

/**
 * Who may dictate. Both dictation routes (a finished clip, and a live
 * connection) ask this first, so they cannot drift apart: signed in, a plan
 * with AI, and allowed to edit a work order, since that is what dictation
 * writes into.
 */
export async function dictationAccess(): Promise<
  { ok: true; organizationId: string; userId: string } | { ok: false; response: NextResponse }
> {
  const refuse = (status: number, error: string) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status }),
  })

  const ctx = await getAuthContext()
  if (!ctx) return refuse(401, 'Unauthorized')
  const { organizationId, userId } = ctx

  const features = await getFeatures(organizationId)
  if (!features.ai) return refuse(403, 'AI is not included in your plan.')

  const membership = ctx.isSuperAdmin ? null : await getCachedMembership(userId)
  const permissions = membership?.customRole?.permissions ?? []
  const allowed =
    ctx.isAdmin ||
    hasPermission(permissions, {
      action: PermissionAction.UPDATE,
      subject: PermissionSubject.WORK_ORDERS,
    })
  if (!allowed) return refuse(403, 'Insufficient permissions')

  return { ok: true, organizationId, userId }
}
