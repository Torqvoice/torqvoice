import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Whoever holds an app setup code is signed in as the person it names, so
 * issuing one borrows that person's standing in the workshop. It may only be
 * issued looking down the team: never for a peer admin, never for the owner,
 * always for yourself, and by the owner for anybody.
 */

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
    technician: { findFirst: vi.fn() },
    technicianSetupCode: { deleteMany: vi.fn(), create: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { createAppSetupCode } from '@/features/team/Actions/createAppSetupCode'
import { canIssueAppSetupCode } from '@/features/team/Lib/appSetupRules'

type Standing = { role: string; customRoleIsAdmin?: boolean }

/** Signs in `userId` with this standing in org-1. */
function signIn(userId: string, standing: Standing) {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: userId } } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role: standing.role,
    roleId: standing.customRoleIsAdmin ? 'role-admin' : null,
    customRole: standing.customRoleIsAdmin ? { isAdmin: true, permissions: [] } : null,
  } as never)
}

/** The person the code is for, a technician in org-1 with this standing. */
function target(userId: string, standing: Standing) {
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    role: standing.role,
    customRole: standing.customRoleIsAdmin ? { isAdmin: true } : null,
    user: { id: userId, name: 'Kari', email: 'kari@example.com' },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  vi.mocked(db.technician.findFirst).mockResolvedValue({ id: 'tech-1' } as never)
  vi.mocked(db.technicianSetupCode.deleteMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(db.technicianSetupCode.create).mockResolvedValue({} as never)
})

describe('createAppSetupCode standing', () => {
  it('refuses an admin setting up the app for the owner', async () => {
    signIn('admin-1', { role: 'admin' })
    target('owner-1', { role: 'owner' })

    const result = await createAppSetupCode({ userId: 'owner-1' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only the owner can set up the app for the owner.')
    expect(db.technicianSetupCode.create).not.toHaveBeenCalled()
  })

  it('refuses an admin setting up the app for another admin', async () => {
    signIn('admin-1', { role: 'admin' })
    target('admin-2', { role: 'admin' })

    const result = await createAppSetupCode({ userId: 'admin-2' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only the owner can set up the app for an admin.')
    expect(db.technicianSetupCode.create).not.toHaveBeenCalled()
  })

  it('counts a custom role with the admin switch as an admin, on both sides', async () => {
    signIn('admin-1', { role: 'member', customRoleIsAdmin: true })
    target('admin-2', { role: 'member', customRoleIsAdmin: true })

    const result = await createAppSetupCode({ userId: 'admin-2' })

    expect(result.success).toBe(false)
    expect(db.technicianSetupCode.create).not.toHaveBeenCalled()
  })

  it('lets an admin set up the app for a technician', async () => {
    signIn('admin-1', { role: 'admin' })
    target('tech-user', { role: 'member' })

    const result = await createAppSetupCode({ userId: 'tech-user' })

    expect(result.success).toBe(true)
    expect(db.technicianSetupCode.create).toHaveBeenCalledTimes(1)
  })

  it('lets the owner set up the app for anyone', async () => {
    signIn('owner-1', { role: 'owner' })
    for (const standing of [
      { role: 'admin' },
      { role: 'member', customRoleIsAdmin: true },
      { role: 'member' },
    ]) {
      target('someone', standing)
      const result = await createAppSetupCode({ userId: 'someone' })
      expect(result.success).toBe(true)
    }
    expect(db.technicianSetupCode.create).toHaveBeenCalledTimes(3)
  })

  it('lets anyone set up their own phone', async () => {
    signIn('admin-1', { role: 'admin' })
    target('admin-1', { role: 'admin' })

    const result = await createAppSetupCode({ userId: 'admin-1' })

    expect(result.success).toBe(true)
    expect(db.technicianSetupCode.create).toHaveBeenCalledTimes(1)
  })
})

describe('canIssueAppSetupCode', () => {
  it('keeps a non-admin who can manage settings to their own phone', () => {
    const caller = { userId: 'u1', role: 'member', isAdmin: false }
    expect(
      canIssueAppSetupCode(caller, { userId: 'u2', role: 'member', customRoleIsAdmin: false })
    ).toEqual({ ok: false, reason: 'Only an owner or admin can set up the app for someone else.' })
    expect(
      canIssueAppSetupCode(caller, { userId: 'u1', role: 'member', customRoleIsAdmin: false })
    ).toEqual({ ok: true })
  })

  it('treats a super admin as the owner', () => {
    expect(
      canIssueAppSetupCode(
        { userId: 'u1', role: 'super_admin', isAdmin: true },
        { userId: 'u2', role: 'owner', customRoleIsAdmin: false }
      )
    ).toEqual({ ok: true })
  })
})
