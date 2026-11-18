import { db } from '@/lib/db'

/**
 * The name of the custom role picked for someone, or undefined when none was.
 *
 * The id comes from the browser and can belong to another workshop, so it is
 * looked up within this one and refused when it is not there. The name is
 * what the audit log and the invitation mail show, since "member" says
 * nothing about what a Front desk role lets a person do.
 */
export async function customRoleName(organizationId: string, roleId?: string | null) {
  if (!roleId) return undefined
  const role = await db.role.findFirst({
    where: { id: roleId, organizationId },
    select: { name: true },
  })
  if (!role) throw new Error('Role not found')
  return role.name
}
