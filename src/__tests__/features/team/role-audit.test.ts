/**
 * The audit log says which role a person was given. An invitation with a
 * custom role used to read "Invited maya@example.com as member", and changing
 * someone's role on the team page wrote nothing at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The audit line is rendered with next-intl's own translator, which the global mock leaves out.
vi.unmock('next-intl')
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))
vi.mock('@/features/email/Lib/sendTemplatedMail', () => ({
  sendTemplatedMail: vi.fn().mockResolvedValue({ subject: 'Team invitation' }),
}))
vi.mock('@/features/webhooks/Lib/dispatcher', () => ({ dispatchWebhookEvent: vi.fn() }))
vi.mock('@/features/integrations/Lib/events', () => ({ notifyIntegrations: vi.fn() }))
vi.mock('@/features/team/Lib/memberSeats', () => ({
  memberSeats: vi.fn().mockResolvedValue({ full: false, limit: 5 }),
}))
vi.mock('@/lib/email-verification-policy', () => ({
  emailVerificationRequired: vi.fn().mockResolvedValue(false),
}))
vi.mock('@/features/team/Lib/technicianStanding', () => ({
  setTechnicianStanding: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    teamInvitation: {
      findFirst: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    organizationMember: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    role: { findFirst: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { assignRole } from '@/features/team/Actions/assignRole'
import { inviteMember } from '@/features/team/Actions/teamActions'
import { sendInvitation } from '@/features/team/Actions/sendInvitation'

const ORG = 'org-a'
const FRONT_DESK = 'role-front-desk'

/** The English line the audit log shows for the last entry written. */
async function lastAuditLine() {
  await vi.waitFor(() => expect(db.auditLog.create).toHaveBeenCalled())
  const calls = vi.mocked(db.auditLog.create).mock.calls
  return calls[calls.length - 1][0].data.message
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getCachedSession).mockResolvedValue({
    user: { id: 'owner-1', email: 'owner@example.com' },
  } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: ORG,
    role: 'owner',
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
  // Only this workshop's Front desk role exists; any other id is someone else's.
  vi.mocked(db.role.findFirst).mockImplementation((async (args: {
    where: { id?: string; organizationId: string }
  }) =>
    args.where.id === FRONT_DESK && args.where.organizationId === ORG
      ? { id: FRONT_DESK, name: 'Front desk' }
      : null) as never)
  vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(null)
  vi.mocked(db.teamInvitation.create).mockResolvedValue({ id: 'inv-1' } as never)
})

describe('invitations', () => {
  function asWorkshopOwner() {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      userId: 'owner-1',
      organizationId: ORG,
      role: 'owner',
      organization: { name: 'Riverside Auto' },
    } as never)
  }

  it('names the custom role an invitation gives', async () => {
    asWorkshopOwner()
    const result = await sendInvitation({
      email: 'maya@example.com',
      role: 'member',
      roleId: FRONT_DESK,
    })
    expect(result.success).toBe(true)
    expect(await lastAuditLine()).toBe('Invited maya@example.com as Front desk')
  })

  it('names the custom role when the add-person dialog invites by email', async () => {
    asWorkshopOwner()
    vi.mocked(db.user.findFirst).mockResolvedValue(null)
    const result = await inviteMember({
      email: 'maya@example.com',
      role: 'member',
      roleId: FRONT_DESK,
    })
    expect(result.success).toBe(true)
    expect(await lastAuditLine()).toBe('Invited maya@example.com as Front desk')
  })

  it('still says member when no custom role was picked', async () => {
    asWorkshopOwner()
    await sendInvitation({ email: 'maya@example.com', role: 'member' })
    expect(await lastAuditLine()).toBe('Invited maya@example.com as member')
  })

  it('names the role when an existing account joins on the spot', async () => {
    vi.mocked(db.organizationMember.findFirst)
      .mockResolvedValueOnce({
        userId: 'owner-1',
        organizationId: ORG,
        role: 'owner',
        organization: { name: 'Riverside Auto' },
      } as never)
      .mockResolvedValueOnce(null)
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: 'maya', emailVerified: true } as never)
    const result = await inviteMember({
      email: 'maya@example.com',
      role: 'member',
      roleId: FRONT_DESK,
    })
    expect(result.success).toBe(true)
    expect(db.organizationMember.create).toHaveBeenCalled()
    expect(await lastAuditLine()).toBe('Invited maya@example.com as Front desk')
  })

  it('only gives a role from this workshop when an existing account joins on the spot', async () => {
    vi.mocked(db.organizationMember.findFirst)
      .mockResolvedValueOnce({
        userId: 'owner-1',
        organizationId: ORG,
        role: 'owner',
        organization: { name: 'Riverside Auto' },
      } as never)
      .mockResolvedValueOnce(null)
    vi.mocked(db.user.findFirst).mockResolvedValue({ id: 'maya', emailVerified: true } as never)
    const result = await inviteMember({
      email: 'maya@example.com',
      role: 'member',
      roleId: 'role-of-another-workshop',
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('Role not found')
    expect(db.organizationMember.create).not.toHaveBeenCalled()
  })
})

describe('changing a role', () => {
  beforeEach(() => {
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue({
      id: 'member-maya',
      userId: 'maya',
      organizationId: ORG,
      role: 'member',
      roleId: null,
    } as never)
  })

  it('logs the custom role a member is given', async () => {
    const result = await assignRole({ memberId: 'member-maya', role: 'member', roleId: FRONT_DESK })
    expect(result.success).toBe(true)
    expect(await lastAuditLine()).toBe("Changed a member's role to Front desk")
  })

  it('logs a built-in role too', async () => {
    const result = await assignRole({ memberId: 'member-maya', role: 'admin', roleId: null })
    expect(result.success).toBe(true)
    expect(await lastAuditLine()).toBe("Changed a member's role to admin")
  })
})
