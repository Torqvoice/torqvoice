import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * Whether this user may edit vehicles, which is what putting a customer on
 * one is. The same rule `withAuth` applies to `updateVehicle`, asked ahead of
 * time so a page does not offer a button that would be refused.
 *
 * Owners, admins and super admins always qualify. A member with a custom role
 * needs UPDATE on vehicles; a member with no custom role keeps full access.
 */
export async function canEditVehicles(
  userId: string,
  role: string | null | undefined
): Promise<boolean> {
  if (role === 'owner' || role === 'admin' || role === 'super_admin') return true
  if (!userId) return false

  const membership = await getCachedMembership(userId)
  if (!membership?.roleId) return true

  return hasPermission(membership.customRole?.permissions ?? [], {
    action: PermissionAction.UPDATE,
    subject: PermissionSubject.VEHICLES,
  })
}
