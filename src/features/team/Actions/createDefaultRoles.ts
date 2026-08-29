'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { withAuth } from '@/lib/with-auth'
import {
  ensureMemberRole,
  ensureTechnicianRole,
  MEMBER_ROLE_NAME,
  TECHNICIAN_ROLE_NAME,
} from '../Lib/technicianRole'

/**
 * Gives a workshop the two roles it almost certainly wants.
 *
 * Nothing seeds roles when an organization is created, so every workshop
 * started with none and the word "Member" in the role dropdown granted
 * nothing at all: `member` is Better Auth's membership tier, not a permission
 * set. A member with no role has no permissions and is refused by every
 * screen, which is a promise the dropdown was not keeping.
 *
 * Made on demand rather than in a migration, so existing workshops get them
 * by pressing a button and nobody's carefully narrowed roles are touched.
 * Both are ordinary roles afterwards: renameable, editable, deletable.
 */
export async function createDefaultRoles() {
  return withAuth(
    async ({ organizationId }) => {
      const before = await db.role.findMany({
        where: { organizationId, name: { in: [MEMBER_ROLE_NAME, TECHNICIAN_ROLE_NAME] } },
        select: { name: true },
      })
      const had = new Set(before.map((r) => r.name))

      await ensureMemberRole(db, organizationId)
      await ensureTechnicianRole(db, organizationId)

      const created = [MEMBER_ROLE_NAME, TECHNICIAN_ROLE_NAME].filter((n) => !had.has(n))
      revalidatePath('/settings/team')
      return { created }
    },
    {
      requiredPermissions: [
        { action: PermissionAction.MANAGE, subject: PermissionSubject.SETTINGS },
      ],
      audit: ({ result }) => ({
        action: 'team.createDefaultRoles',
        message: 'Created the default roles',
        metadata: { created: result.created },
      }),
    }
  )
}
