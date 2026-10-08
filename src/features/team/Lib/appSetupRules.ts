/**
 * Who may set up the technician app for whom.
 *
 * A setup code signs its holder in as the person it was issued for, and the
 * desk that issues it is the one holding the QR. So issuing one is, in effect,
 * borrowing that person's standing in this workshop for as long as the session
 * lasts. That is only safe looking down: an admin borrowing an admin's
 * standing, or the owner's, is a way up the ladder that no other screen allows
 * (see invitationRules.ts, where handing out admin is the owner's alone for
 * the same reason).
 *
 * Standing is the owner, then admins (the built-in role or a custom role with
 * the admin switch), then everybody else. The owner may set up anyone, and
 * anyone may set up their own phone.
 */

import type { InviteDecision } from './invitationRules'

export type SetupCaller = { userId: string; role: string; isAdmin: boolean }
export type SetupTarget = { userId: string; role: string; customRoleIsAdmin: boolean }

/** Super admins sit with the owner, as they do when handing out admin. */
const OWNER_STANDING = new Set(['owner', 'super_admin'])

function standing(role: string, isAdmin: boolean): number {
  if (OWNER_STANDING.has(role)) return 2
  if (role === 'admin' || isAdmin) return 1
  return 0
}

export function canIssueAppSetupCode(caller: SetupCaller, target: SetupTarget): InviteDecision {
  if (target.userId === caller.userId) return { ok: true }

  const callerStanding = standing(caller.role, caller.isAdmin)
  if (callerStanding === 2) return { ok: true }

  const targetStanding = standing(target.role, target.customRoleIsAdmin)
  if (targetStanding < callerStanding) return { ok: true }

  if (targetStanding === 2) {
    return { ok: false, reason: 'Only the owner can set up the app for the owner.' }
  }
  if (targetStanding === 1) {
    return { ok: false, reason: 'Only the owner can set up the app for an admin.' }
  }
  return { ok: false, reason: 'Only an owner or admin can set up the app for someone else.' }
}
