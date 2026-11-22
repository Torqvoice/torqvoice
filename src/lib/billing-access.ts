import { getCachedMembership } from '@/lib/cached-session'
import { hasAllPermissions, PermissionAction, PermissionSubject } from '@/lib/permissions'
import type { AuthContext } from '@/lib/with-auth'

/**
 * Whether this person may record a payment on a job. The answer `withAuth`
 * gives `createPayment`, asked ahead of time so a page does not offer a
 * button that would be refused.
 *
 * As in `withAuth`: super admins, owners, admins and custom roles marked as
 * admin always pass. Everyone else needs CREATE on billing from their custom
 * role, and a member with no custom role has no permissions.
 */
export async function canTakePayments(
  context: Pick<AuthContext, 'userId' | 'isAdmin'> | null | undefined
): Promise<boolean> {
  if (!context) return false
  if (context.isAdmin) return true

  const membership = await getCachedMembership(context.userId)
  return hasAllPermissions(membership?.customRole?.permissions ?? [], [
    { action: PermissionAction.CREATE, subject: PermissionSubject.BILLING },
  ])
}
