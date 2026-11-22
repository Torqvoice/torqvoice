import { getCachedMembership } from '@/lib/cached-session'
import { hasAllPermissions, PermissionAction, PermissionSubject } from '@/lib/permissions'
import type { AuthContext } from '@/lib/with-auth'

/**
 * Whether this person may edit vehicles, which is what putting a customer on
 * one is. The answer `withAuth` gives `updateVehicle`, asked ahead of time so
 * a page does not offer a button that would be refused.
 *
 * Takes the page's auth context (`getAuthContext`), which already knows a
 * super admin from a session bound to one workshop. As in `withAuth`: super
 * admins, owners, admins and custom roles marked as admin always pass,
 * whatever else their role says. Everyone else needs UPDATE on vehicles from
 * their custom role, and a member with no custom role has no permissions.
 */
export async function canEditVehicles(
  context: Pick<AuthContext, 'userId' | 'isAdmin'> | null | undefined
): Promise<boolean> {
  if (!context) return false
  if (context.isAdmin) return true

  const membership = await getCachedMembership(context.userId)
  return hasAllPermissions(membership?.customRole?.permissions ?? [], [
    { action: PermissionAction.UPDATE, subject: PermissionSubject.VEHICLES },
  ])
}
