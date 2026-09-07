import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'
import type { AuthContext } from '@/lib/with-auth'

/**
 * Whether this account may correct clocked time: add, edit, stop or delete
 * entries. Admins may; everyone else needs the grant on their role. Clocking
 * oneself is deliberately not covered here, so a technician's own permission
 * never extends to rewriting their record.
 */
export async function canEditTimeEntries(ctx: Pick<AuthContext, 'userId' | 'isAdmin'>) {
  if (ctx.isAdmin) return true
  const membership = await getCachedMembership(ctx.userId)
  return hasPermission(membership?.customRole?.permissions ?? [], {
    action: PermissionAction.UPDATE,
    subject: PermissionSubject.TIME_TRACKING,
  })
}
