import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ set: vi.fn(), get: vi.fn() }),
}))
// The invitation leaves through the workshop's template like every other
// mail; what this file checks is what the send is told, not how it looks.
vi.mock('@/features/email/Lib/sendTemplatedMail', () => ({
  sendTemplatedMail: vi.fn().mockResolvedValue({ subject: 'Team invitation' }),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/db', () => ({
  db: {
    teamInvitation: { findFirst: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    organizationMember: { findFirst: vi.fn() },
  },
}))

import { getCachedMembership, getCachedSession } from '@/lib/cached-session'
import { db } from '@/lib/db'
import { sendTemplatedMail } from '@/features/email/Lib/sendTemplatedMail'
import { resendInvitation } from '@/features/team/Actions/resendInvitation'

const INVITATION = {
  id: 'inv-1',
  email: 'new@example.com',
  role: 'member',
  token: 'old-token',
  organization: { name: 'Bergen Auto' },
  customRole: null,
}

function signIn(role: 'owner' | 'member') {
  vi.mocked(getCachedSession).mockResolvedValue({ user: { id: 'u1' } } as never)
  vi.mocked(getCachedMembership).mockResolvedValue({
    organizationId: 'org-1',
    role,
    roleId: null,
    customRole: null,
  } as never)
  vi.mocked(db.user.findUnique).mockResolvedValue({ isSuperAdmin: false } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(db.teamInvitation.findFirst).mockResolvedValue(INVITATION as never)
  vi.mocked(db.teamInvitation.update).mockResolvedValue(INVITATION as never)
})

describe('resendInvitation', () => {
  it('mails a fresh link and retires the old one', async () => {
    signIn('owner')
    const result = await resendInvitation({ invitationId: 'inv-1' })
    expect(result.success).toBe(true)

    const update = vi.mocked(db.teamInvitation.update).mock.calls[0][0]
    expect(update.where).toEqual({ id: 'inv-1' })
    expect(update.data.token).not.toBe('old-token')
    const expiresAt = update.data.expiresAt as Date
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000)

    const [orgId, mail] = vi.mocked(sendTemplatedMail).mock.calls[0]
    expect(orgId).toBe('org-1')
    expect(mail.kind).toBe('team_invitation')
    expect(mail.to).toBe('new@example.com')
    const context = mail.context as { inviteLink: string; role: string; expiresAt: Date }
    expect(context.inviteLink).toContain(`invite=${update.data.token}`)
    expect(context.inviteLink).not.toContain('old-token')
    expect(context.role).toBe('member')
    expect(context.expiresAt).toBe(expiresAt)
  })

  it("only finds invitations of the caller's own workshop", async () => {
    signIn('owner')
    await resendInvitation({ invitationId: 'inv-1' })
    const where = vi.mocked(db.teamInvitation.findFirst).mock.calls[0][0]?.where
    expect(where).toMatchObject({ id: 'inv-1', organizationId: 'org-1', status: 'pending' })
  })

  it('refuses a member who is not an owner or admin', async () => {
    signIn('member')
    const result = await resendInvitation({ invitationId: 'inv-1' })
    expect(result.success).toBe(false)
    expect(sendTemplatedMail).not.toHaveBeenCalled()
  })
})
