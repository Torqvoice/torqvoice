import 'server-only'
import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * Whether this user may record time off: the work board's edit right, by the
 * same rule withAuth applies. Owners and admins always may; a member with no
 * custom role keeps full access; a custom role needs UPDATE on the work board.
 */
export async function canEditTimeOff(userId: string, role: string | null | undefined) {
  if (role === 'owner' || role === 'admin' || role === 'super_admin') return true
  if (!userId) return false
  const membership = await getCachedMembership(userId)
  if (!membership?.roleId) return true
  return hasPermission(membership.customRole?.permissions ?? [], {
    action: PermissionAction.UPDATE,
    subject: PermissionSubject.WORK_BOARD,
  })
}
