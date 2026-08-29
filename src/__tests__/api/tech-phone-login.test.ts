import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Signing a technician back in with a code. Everything here is scoped to one
 * workshop, and the tests that matter are the ones proving it cannot reach
 * past that.
 */

vi.mock('@/lib/auth', () => ({
  auth: { $context: Promise.resolve({ internalAdapter: { createSession: vi.fn() } }) },
}))

vi.mock('@/lib/db', () => ({
  db: {
    organization: { findUnique: vi.fn() },
    technician: { findFirst: vi.fn(), findMany: vi.fn() },
    technicianLoginCode: {
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn(),
    },
    organizationMember: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/sms', () => ({
  sendOrgSms: vi.fn(),
  getOrgSmsProvider: vi.fn(),
  normalizeOrgPhone: vi.fn(),
}))
vi.mock('@/lib/email', () => ({ sendOrgMail: vi.fn(), getOrgFromAddress: vi.fn() }))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { normalizeOrgPhone, sendOrgSms } from '@/lib/sms'
import { sendOrgMail } from '@/lib/email'
import { rateLimit } from '@/lib/rate-limit'
import { POST as requestCode } from '@/app/api/v1/tech/org/[orgId]/auth/request/route'
import { POST as verifyCode } from '@/app/api/v1/tech/org/[orgId]/auth/verify/route'
import { hashLoginCode, MAX_ATTEMPTS } from '@/features/technician-auth/Lib/loginCode'

const createSession = vi.mocked(
  (await auth.$context).internalAdapter.createSession as ReturnType<typeof vi.fn>
)
const ORG = 'org-a'
const OTHER_ORG = 'org-b'
const CODE = '123456'

function call(handler: typeof requestCode, orgId: string, body: unknown) {
  return handler(
    new Request(`https://shop.example.com/api/v1/tech/org/${orgId}/auth/request`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orgId }) }
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rateLimit).mockReturnValue(null)
  vi.mocked(db.organization.findUnique).mockResolvedValue({ id: ORG, name: 'Bay Street' } as never)
  vi.mocked(db.technicianLoginCode.deleteMany).mockResolvedValue({ count: 0 } as never)
  vi.mocked(db.technicianLoginCode.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(db.technicianLoginCode.create).mockResolvedValue({} as never)
  vi.mocked(db.organizationMember.findFirst).mockResolvedValue({ id: 'mem-1' } as never)
  createSession.mockResolvedValue({ token: 'session-token' })
  vi.mocked(normalizeOrgPhone).mockImplementation(async (_org, phone) =>
    phone.replace(/\s/g, '').startsWith('+')
      ? phone.replace(/\s/g, '')
      : `+47${phone.replace(/\D/g, '')}`
  )
})

describe('requesting a code', () => {
  it('sends one to a technician of this workshop', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', phone: '+4791234567', user: { email: 'a@x.test' } },
    ] as never)

    const res = await call(requestCode, ORG, { phone: '+47 912 34 567' })

    expect(res.status).toBe(200)
    expect(sendOrgSms).toHaveBeenCalledWith(ORG, expect.objectContaining({ to: '+47 912 34 567' }))
    expect(db.technicianLoginCode.create).toHaveBeenCalled()
  })

  it('matches a number however either side wrote it', async () => {
    // Desk stored local digits, technician typed full international.
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', phone: '912 34 567', user: { email: 'a@x.test' } },
    ] as never)

    await call(requestCode, ORG, { phone: '+4791234567' })
    expect(db.technicianLoginCode.create).toHaveBeenCalled()
  })

  it('answers the same when nobody matches', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([] as never)

    const res = await call(requestCode, ORG, { phone: '+4700000000' })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ data: { sent: true, channel: null } })
    expect(sendOrgSms).not.toHaveBeenCalled()
    expect(db.technicianLoginCode.create).not.toHaveBeenCalled()
  })

  it('answers the same for a workshop that does not exist', async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(null as never)

    const res = await call(requestCode, 'made-up', { phone: '+4791234567' })
    expect(await res.json()).toEqual({ data: { sent: true, channel: null } })
  })

  it('never looks a technician up outside the workshop in the path', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([] as never)
    await call(requestCode, ORG, { phone: '+4791234567' })

    const where = vi.mocked(db.technician.findMany).mock.calls[0]?.[0]?.where
    expect(where).toEqual(expect.objectContaining({ organizationId: ORG, isActive: true }))
  })

  it('will not send to somebody who has been deactivated', async () => {
    // isActive is part of the query, so a deactivated technician is simply
    // never a candidate.
    vi.mocked(db.technician.findMany).mockResolvedValue([] as never)
    await call(requestCode, ORG, { phone: '+4791234567' })
    expect(sendOrgSms).not.toHaveBeenCalled()
  })

  it('sends by email when asked by email', async () => {
    vi.mocked(db.technician.findFirst).mockResolvedValue({
      id: 'tech-1',
      user: { email: 'a@x.test' },
    } as never)

    const res = await call(requestCode, ORG, { email: 'A@X.test' })

    expect((await res.json()).data.channel).toBe('email')
    expect(sendOrgMail).toHaveBeenCalledWith(ORG, expect.objectContaining({ to: 'a@x.test' }))
    expect(sendOrgSms).not.toHaveBeenCalled()
  })

  it('replaces an outstanding code rather than adding one', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', phone: '+4791234567', user: { email: 'a@x.test' } },
    ] as never)

    await call(requestCode, ORG, { phone: '+4791234567' })

    expect(db.technicianLoginCode.deleteMany).toHaveBeenCalledWith({
      where: { technicianId: 'tech-1', usedAt: null },
    })
  })

  it('still answers success when delivery throws', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', phone: '+4791234567', user: { email: 'a@x.test' } },
    ] as never)
    vi.mocked(sendOrgSms).mockRejectedValue(new Error('provider down'))

    const res = await call(requestCode, ORG, { phone: '+4791234567' })
    expect(res.status).toBe(200)
  })
})

describe('verifying a code', () => {
  const live = (overrides: Record<string, unknown> = {}) => ({
    id: 'code-1',
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    technician: { id: 'tech-1', isActive: true, userId: 'user-1', organizationId: ORG },
    ...overrides,
  })

  it('exchanges a good code for a session', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)

    const res = await call(verifyCode, ORG, { code: CODE })

    expect(await res.json()).toEqual({ data: { token: 'session-token', organizationId: ORG } })
    expect(createSession).toHaveBeenCalledWith('user-1', false)
  })

  it('looks the code up by hash inside this workshop only', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    await call(verifyCode, ORG, { code: CODE })

    expect(db.technicianLoginCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, usedAt: null, codeHash: hashLoginCode(CODE) },
      })
    )
  })

  it('accepts a code with the spaces a keyboard adds', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    const res = await call(verifyCode, ORG, { code: ' 123 456 ' })
    expect(res.status).toBe(200)
  })

  it('refuses a code that belongs to another workshop', async () => {
    // Even were the query to find it, the technician's own org is checked.
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({
        technician: { id: 't', isActive: true, userId: 'u', organizationId: OTHER_ORG },
      }) as never
    )

    const res = await call(verifyCode, ORG, { code: CODE })
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses somebody deactivated since the code was sent', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({ technician: { id: 't', isActive: false, userId: 'u', organizationId: ORG } }) as never
    )

    expect((await (await call(verifyCode, ORG, { code: CODE })).json()).error.code).toBe(
      'not_technician'
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses somebody removed from the workshop since the code was sent', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null as never)

    expect((await (await call(verifyCode, ORG, { code: CODE })).json()).error.code).toBe(
      'not_technician'
    )
  })

  it('refuses an expired code', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({ expiresAt: new Date(Date.now() - 1) }) as never
    )
    expect((await (await call(verifyCode, ORG, { code: CODE })).json()).error.code).toBe(
      'code_expired'
    )
  })

  it('refuses once the attempt limit is reached', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({ attempts: MAX_ATTEMPTS }) as never
    )
    expect((await (await call(verifyCode, ORG, { code: CODE })).json()).error.code).toBe(
      'too_many_attempts'
    )
  })

  it('ages every live code in the workshop on a wrong guess', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(null as never)

    await call(verifyCode, ORG, { code: '999999' })

    expect(db.technicianLoginCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    )
    expect(db.technicianLoginCode.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, attempts: { gte: MAX_ATTEMPTS } },
    })
  })

  it('burns the code before minting the session', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    await call(verifyCode, ORG, { code: CODE })

    expect(db.technicianLoginCode.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1', usedAt: null } })
    )
    expect(vi.mocked(db.technicianLoginCode.updateMany).mock.invocationCallOrder[0]).toBeLessThan(
      createSession.mock.invocationCallOrder[0]
    )
  })

  it('lets only one of two racing attempts win', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    vi.mocked(db.technicianLoginCode.updateMany).mockResolvedValue({ count: 0 } as never)

    expect((await (await call(verifyCode, ORG, { code: CODE })).json()).error.code).toBe(
      'invalid_code'
    )
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses anything that is not six digits without a query', async () => {
    for (const code of ['', '12345', '1234567', 'abcdef', null]) {
      const res = await call(verifyCode, ORG, { code })
      expect((await res.json()).error.code).toBe('invalid_code')
    }
    expect(db.technicianLoginCode.findFirst).not.toHaveBeenCalled()
  })
})
