import 'server-only'

import { NextResponse } from 'next/server'
import { getCachedMembership } from '@/lib/cached-session'
import { getAuthContext } from '@/lib/get-auth-context'
import type { AuthContext } from '@/lib/with-auth'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import { rateLimit } from '@/lib/rate-limit'

/**
 * Who may upload for the email designer, decided the way withAuth decides
 * it for the actions: owners, admins and custom-admin roles always; anyone
 * else only with the settings permission, which a member with no role does
 * not have. One answer for the logo route, the image route and the actions,
 * so a person can never upload what they could not save, or the reverse.
 */
export async function canManageEmailTemplates(ctx: AuthContext): Promise<boolean> {
  if (ctx.isAdmin) return true
  const membership = await getCachedMembership(ctx.userId)
  const permissions = membership?.customRole?.permissions ?? []
  return hasPermission(permissions, {
    action: PermissionAction.UPDATE,
    subject: PermissionSubject.SETTINGS,
  })
}

/**
 * The checks every email upload route runs before touching the file: a
 * session, the permission, and a ceiling on how often one person can make
 * the server decode an image.
 */
export async function guardEmailUpload(
  request: Request
): Promise<{ ctx: AuthContext } | { response: NextResponse }> {
  const limited = rateLimit(request, { limit: 30, windowMs: 60_000 })
  if (limited) return { response: limited }
  const ctx = await getAuthContext()
  if (!ctx) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!(await canManageEmailTemplates(ctx))) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { ctx }
}
