import { getCachedMembership } from '@/lib/cached-session'
import { hasPermission, PermissionAction, PermissionSubject } from '@/lib/permissions'

/**
 * Whether this user may change workshop settings.
 *
 * The same rule the settings layout enforces, lifted out so pages elsewhere
 * can decide whether to offer a shortcut into settings at all. Pointing a
 * technician at a page that will redirect them is worse than not offering the
 * link: it reads as the app being broken rather than as a permission they do
 * not have.
 *
 * Owners, admins and super admins always qualify. A member with a custom role
 * needs UPDATE on settings; a member with no custom role keeps full access,
 * which is the default the layout applies.
 */
export async function canEditSettings(
  userId: string,
  role: string | null | undefined
): Promise<boolean> {
  if (role === 'owner' || role === 'admin' || role === 'super_admin') return true
  if (!userId) return false

  const membership = await getCachedMembership(userId)
  if (!membership?.roleId) return true

  return hasPermission(membership.customRole?.permissions ?? [], {
    action: PermissionAction.UPDATE,
    subject: PermissionSubject.SETTINGS,
  })
}

/**
 * Whether a link into a settings page lands there for this user, ready to
 * change what it points at. The settings pages need READ to open at all (the
 * settings layout sends anyone else to the dashboard) and UPDATE to save; a
 * role can hold UPDATE without READ, and is then better off with no link.
 */
export async function canOpenAndEditSettings(
  userId: string,
  role: string | null | undefined
): Promise<boolean> {
  if (role === 'owner' || role === 'admin' || role === 'super_admin') return true
  if (!userId) return false

  const membership = await getCachedMembership(userId)
  if (!membership?.roleId) return true

  const permissions = membership.customRole?.permissions ?? []
  return (
    hasPermission(permissions, {
      action: PermissionAction.READ,
      subject: PermissionSubject.SETTINGS,
    }) &&
    hasPermission(permissions, {
      action: PermissionAction.UPDATE,
      subject: PermissionSubject.SETTINGS,
    })
  )
}
