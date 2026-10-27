'use server'

import { withAuth } from '@/lib/with-auth'
import { PermissionAction, PermissionSubject } from '@/lib/permissions'
import { memberSeats } from '../Lib/memberSeats'

/**
 * Whether the plan has a seat left for somebody in the office. Read when the
 * add-person dialog opens, so a full plan says so before anyone types an
 * address, rather than after Invite.
 */
export async function getMemberSeats() {
  return withAuth(async ({ organizationId }) => memberSeats(organizationId), {
    requiredPermissions: [{ action: PermissionAction.READ, subject: PermissionSubject.SETTINGS }],
  })
}
