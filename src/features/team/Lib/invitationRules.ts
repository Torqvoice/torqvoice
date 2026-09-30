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
 * Whether `caller` may change what `target` is, to `requested`.
 *
 * The same question as inviting, asked of a person already on the team.
 * Handing out the built-in admin role is the owner's alone, on both paths:
 * `updateMemberRole` refuses anybody but the owner, and `assignRole` used to
 * ask only for admin standing, so a custom role with the admin switch could
 * make itself, or anyone, a built-in admin and from there edit roles and
 * remove members. Taking admin away is the owner's call for the same reason:
 * an admin must not be able to demote a peer.
 */
export function canAssignRole(
  caller: InviteCaller & { userId: string },
  target: { userId: string; role: string },
  requested: { role?: string }
): InviteDecision {
  if (!caller.isAdmin) {
    return { ok: false, reason: 'Only owners and admins can assign roles' }
  }
  if (target.role === 'owner') {
    return { ok: false, reason: 'Cannot assign a role to the owner' }
  }
  if (target.userId === caller.userId) {
    return { ok: false, reason: 'You cannot change your own role' }
  }
  const touchesAdmin = requested.role === 'admin' || target.role === 'admin'
  if (touchesAdmin && !CAN_GRANT_ADMIN.has(caller.role)) {
    return { ok: false, reason: 'Only the owner can change who is an admin' }
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
