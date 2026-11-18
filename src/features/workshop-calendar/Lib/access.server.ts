import 'server-only'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * Whether this user may record leave: the work board's edit right, by the
 * same rule withAuth applies, so the screens offer exactly what the actions
 * accept. Owners, admins and a custom role marked as admin always may; a
 * member with no role has no permissions; any other custom role needs UPDATE
 * on the work board.
 */
export async function canEditTimeOff(userId: string, role: string | null | undefined) {
  if (role === 'owner' || role === 'admin' || role === 'super_admin') return true
  if (!userId) return false
  const membership = await getCachedMembership(userId)
  if (!membership) return false
  if (membership.role === 'owner' || membership.role === 'admin') return true
  if (membership.customRole?.isAdmin === true) return true
  if (!membership.customRole) return false
  return hasPermission(membership.customRole.permissions ?? [], {
    action: PermissionAction.UPDATE,
    subject: PermissionSubject.WORK_BOARD,
  })
}
