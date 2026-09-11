import 'server-only'

import { getCachedMembership } from '@/lib/cached-session'
import { hasAllPermissions } from '@/lib/permissions'
import type { AuthContext } from '@/lib/with-auth'
import { IMPORT_ENTITIES, permissionsFor } from './permissions'

/**
 * Whether this person may stage a file for import at all: an owner or
 * admin always, anyone else only with the permissions for at least one
 * import kind. The commit step checks the exact kind against the file.
 */
export async function canImportAnything(ctx: AuthContext): Promise<boolean> {
  if (ctx.isAdmin) return true
  const membership = await getCachedMembership(ctx.userId)
  const permissions = membership?.customRole?.permissions ?? []
  return IMPORT_ENTITIES.some((entity) => hasAllPermissions(permissions, permissionsFor(entity)))
}
