/**
 * Who may bring somebody onto the team, and with what standing.
 *
 * Both ways of adding a person (`sendInvitation` for an address without an
 * account, `inviteMember` for one that already has one) ask this one question,
 * so the two paths cannot drift apart again. Before this, `sendInvitation`
 * only required MANAGE:SETTINGS, which a custom role can carry without being
 * an admin, and it accepted `role: 'admin'` from anybody. A settings manager
 * could invite a second address of their own as admin and walk in as one.
 */

export type InviteCaller = { role: string; isAdmin: boolean }
export type InvitableRole = 'admin' | 'member'

export type InviteDecision = { ok: true } | { ok: false; reason: string }

/** Roles that may hand out the built-in admin role. */
const CAN_GRANT_ADMIN = new Set(['owner', 'super_admin'])

export function canInvite(caller: InviteCaller, requestedRole: InvitableRole): InviteDecision {
  if (!caller.isAdmin) {
    return { ok: false, reason: 'Only owners and admins can invite members' }
  }
  if (requestedRole === 'admin' && !CAN_GRANT_ADMIN.has(caller.role)) {
    return { ok: false, reason: 'Only the owner can invite admins' }
  }
  return { ok: true }
}

/**
 * What the team page gets to see about a pending invitation. The token is
 * deliberately absent: it is the credential that lets whoever holds it join
 * as the invitee, so it belongs in the invitee's inbox and nowhere else.
 */
export const pendingInvitationSelect = {
  id: true,
  email: true,
  role: true,
  roleId: true,
  createdAt: true,
  expiresAt: true,
  customRole: {
    select: { name: true },
  },
} as const
