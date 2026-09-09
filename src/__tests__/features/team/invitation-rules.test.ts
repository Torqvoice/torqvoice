/**
 * Who may invite whom, and what the team page gets to see about a pending
 * invitation.
 *
 * Background: sendInvitation used to require only MANAGE:SETTINGS and accept
 * role 'admin' from anyone holding it, and getPendingInvitations handed the
 * invitation token to every settings reader. Together that let a low-privilege
 * member join as admin under an address of the boss's choosing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))

vi.mock('@/lib/email', () => ({
  sendOrgMail: vi.fn(),
  getOrgFromAddress: vi.fn(),
}))
vi.mock('@/features/email/Lib/sendTemplatedMail', () => ({
  sendTemplatedMail: vi.fn().mockResolvedValue({ subject: 'Team invitation' }),
}))

vi.mock('@/lib/features', () => ({
  getFeatures: vi.fn().mockResolvedValue({ maxUsers: 100 }),
  getMaxOrganizations: vi.fn(),
  isCloudMode: () => false,
  FeatureGatedError: class extends Error {},
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    teamInvitation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    organizationMember: {
      findFirst: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    role: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))

import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { sendOrgMail, getOrgFromAddress } from '@/lib/email'
import { canInvite, pendingInvitationSelect } from '@/features/team/Lib/invitationRules'
import { sendInvitation } from '@/features/team/Actions/sendInvitation'
import { getPendingInvitations } from '@/features/team/Actions/getPendingInvitations'
import { inviteMember } from '@/features/team/Actions/teamActions'
import { acceptInvitation } from '@/features/team/Actions/acceptInvitation'

const mockSession = vi.mocked(getCachedSession)
const mockMembership = vi.mocked(getCachedMembership)

const ORG = 'org-a'

const MANAGE_SETTINGS = { action: 'manage', subject: 'settings' }

function actAs(role: 'owner' | 'admin' | 'member', customRole: unknown = null) {
  mockSession.mockResolvedValue({ user: { id: 'caller', email: `${role}@org.test` } } as any)
  mockMembership.mockResolvedValue({
    organizationId: ORG,
    role,
    roleId: customRole ? 'role-1' : null,
    customRole,
  } as any)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as any)
}

/** A plain member whose custom role carries MANAGE:SETTINGS but is not an admin role. */
function actAsSettingsManager() {
  actAs('member', { isAdmin: false, permissions: [MANAGE_SETTINGS] })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
    id: 'mem-1',
    organizationId: ORG,
    organization: { name: 'Org A' },
  } as any)
  vi.mocked(db.organizationMember.count).mockResolvedValue(1)
  vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null)
  vi.mocked(db.teamInvitation.deleteMany).mockResolvedValue({ count: 0 } as any)
  vi.mocked(db.teamInvitation.create).mockResolvedValue({ id: 'inv-1', token: 'tok' } as any)
  vi.mocked(db.user.findFirst).mockResolvedValue(null)
  vi.mocked(sendOrgMail).mockResolvedValue(undefined as any)
  vi.mocked(getOrgFromAddress).mockResolvedValue('noreply@org.test' as any)
})

describe('canInvite', () => {
  it('refuses a member who holds MANAGE:SETTINGS but is not an admin', () => {
    expect(canInvite({ role: 'member', isAdmin: false }, 'member')).toEqual({
      ok: false,
      reason: expect.any(String),
    })
    expect(canInvite({ role: 'member', isAdmin: false }, 'admin').ok).toBe(false)
  })

  it('lets an admin invite a member but not an admin', () => {
    expect(canInvite({ role: 'admin', isAdmin: true }, 'member')).toEqual({ ok: true })
    expect(canInvite({ role: 'admin', isAdmin: true }, 'admin').ok).toBe(false)
  })

  it('treats a custom admin role like an admin: members yes, admins no', () => {
    expect(canInvite({ role: 'member', isAdmin: true }, 'member')).toEqual({ ok: true })
    expect(canInvite({ role: 'member', isAdmin: true }, 'admin').ok).toBe(false)
  })

  it('lets the owner invite an admin', () => {
    expect(canInvite({ role: 'owner', isAdmin: true }, 'admin')).toEqual({ ok: true })
    expect(canInvite({ role: 'owner', isAdmin: true }, 'member')).toEqual({ ok: true })
  })
})

describe('sendInvitation applies the rule', () => {
  it('refuses a settings manager who is not an admin', async () => {
    actAsSettingsManager()

    const result = await sendInvitation({ email: 'new@example.com', role: 'member' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only owners and admins can invite members')
    expect(db.teamInvitation.create).not.toHaveBeenCalled()
  })

  it('refuses an admin who asks for the admin role', async () => {
    actAs('admin')

    const result = await sendInvitation({ email: 'new@example.com', role: 'admin' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only the owner can invite admins')
    expect(db.teamInvitation.create).not.toHaveBeenCalled()
  })

  it('lets the owner invite an admin', async () => {
    actAs('owner')

    const result = await sendInvitation({ email: 'new@example.com', role: 'admin' })

    expect(result.success).toBe(true)
    expect(db.teamInvitation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ role: 'admin' }) })
    )
  })
})

describe('inviteMember agrees with sendInvitation', () => {
  it('refuses a settings manager who is not an admin', async () => {
    actAsSettingsManager()

    const result = await inviteMember({ email: 'new@example.com', role: 'member' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only owners and admins can invite members')
    expect(db.organizationMember.create).not.toHaveBeenCalled()
    expect(db.teamInvitation.create).not.toHaveBeenCalled()
  })

  it('refuses an admin who asks for the admin role', async () => {
    actAs('admin')

    const result = await inviteMember({ email: 'new@example.com', role: 'admin' })

    expect(result.success).toBe(false)
    expect(result.error).toBe('Only the owner can invite admins')
  })

  it('answers the same whether or not the address has an account', async () => {
    actAs('admin')

    vi.mocked(db.user.findFirst).mockResolvedValueOnce(null)
    const unknown = await inviteMember({ email: 'new@example.com', role: 'member' })

    vi.mocked(db.user.findFirst).mockResolvedValueOnce({ id: 'user-x' } as any)
    vi.mocked(db.organizationMember.findFirst)
      .mockResolvedValueOnce({ id: 'mem-1', organization: { name: 'Org A' } } as any)
      .mockResolvedValueOnce(null)
    const known = await inviteMember({ email: 'new@example.com', role: 'member' })

    expect(unknown).toEqual(known)
    expect(unknown.data).toEqual({ invited: true, email: 'new@example.com', role: 'member' })
    // The unknown address got an invitation mail; the known one joined directly.
    expect(db.teamInvitation.create).toHaveBeenCalledTimes(1)
    expect(db.organizationMember.create).toHaveBeenCalledTimes(1)
  })
})

describe('getPendingInvitations', () => {
  it('never selects the token', () => {
    expect(pendingInvitationSelect).not.toHaveProperty('token')
  })

  it('passes a select without the token to the database', async () => {
    actAs('owner')
    vi.mocked(db.teamInvitation.findMany).mockResolvedValue([])

    await getPendingInvitations()

    const args = vi.mocked(db.teamInvitation.findMany).mock.calls[0][0] as { select: object }
    expect(args.select).not.toHaveProperty('token')
    expect(Object.keys(args.select)).toEqual(
      expect.arrayContaining(['id', 'email', 'role', 'roleId', 'createdAt', 'expiresAt'])
    )
  })
})

describe('acceptInvitation', () => {
  it('does not mark the address verified', async () => {
    mockSession.mockResolvedValue({ user: { id: 'invitee', email: 'boss@org.test' } } as any)
    vi.mocked(db.teamInvitation.findUnique).mockResolvedValue({
      id: 'inv-1',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      email: 'boss@org.test',
      organizationId: ORG,
      role: 'admin',
      roleId: null,
    } as any)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null)
    vi.mocked(db.$transaction).mockResolvedValue([] as any)

    const result = await acceptInvitation({ token: 'tok' })

    expect(result.success).toBe(true)
    expect(db.user.update).not.toHaveBeenCalled()
    const ops = vi.mocked(db.$transaction).mock.calls[0][0] as unknown as unknown[]
    expect(ops).toHaveLength(2)
  })
})
