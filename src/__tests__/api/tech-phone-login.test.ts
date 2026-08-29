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
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
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
      { id: 'tech-1', user: { email: 'a@x.test', phone: '+4791234567' } },
    ] as never)

    const res = await call(requestCode, ORG, { phone: '+47 912 34 567' })

    expect(res.status).toBe(200)
    expect(sendOrgSms).toHaveBeenCalledWith(ORG, expect.objectContaining({ to: '+47 912 34 567' }))
    expect(db.technicianLoginCode.create).toHaveBeenCalled()
  })

  it('matches a number however either side wrote it', async () => {
    // Desk stored local digits, technician typed full international.
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', user: { email: 'a@x.test', phone: '912 34 567' } },
    ] as never)

    await call(requestCode, ORG, { phone: '+4791234567' })
    expect(db.technicianLoginCode.create).toHaveBeenCalled()
  })

  it('answers a match and a miss with the same bytes', async () => {
    // The whole point. This response used to carry channel:null on a miss and
    // channel:'sms' on a match, which made the endpoint a way of asking a
    // workshop whether it employs a given phone number.
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', user: { email: 'a@x.test', phone: '+4791234567' } },
    ] as never)
    const hit = await (await call(requestCode, ORG, { phone: '+4791234567' })).json()

    vi.mocked(db.technician.findMany).mockResolvedValue([] as never)
    const miss = await (await call(requestCode, ORG, { phone: '+4700000000' })).json()

    expect(hit).toEqual(miss)
    expect(hit).toEqual({ data: { sent: true, channel: 'sms' } })
  })

  it('does no work on a miss, however identical the answer', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([] as never)

    await call(requestCode, ORG, { phone: '+4700000000' })
    expect(sendOrgSms).not.toHaveBeenCalled()
    expect(db.technicianLoginCode.create).not.toHaveBeenCalled()
  })

  it('answers the same for a workshop that does not exist', async () => {
    vi.mocked(db.organization.findUnique).mockResolvedValue(null as never)

    const res = await call(requestCode, 'made-up', { phone: '+4791234567' })
    expect(await res.json()).toEqual({ data: { sent: true, channel: 'sms' } })
  })

  it('answers a junk body the same way too', async () => {
    const res = await call(requestCode, ORG, { nothing: 'useful' })
    expect(await res.json()).toEqual({ data: { sent: true, channel: 'sms' } })
    expect(db.technicianLoginCode.create).not.toHaveBeenCalled()
  })

  it('does not wait on the provider before answering', async () => {
    // Awaiting delivery makes a match measurably slower than a miss, which
    // gives back on the clock what the body refuses to say.
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', user: { email: 'a@x.test', phone: '+4791234567' } },
    ] as never)
    let released: (() => void) | undefined
    vi.mocked(sendOrgSms).mockReturnValue(
      new Promise((resolve) => {
        released = () => resolve({ providerMsgId: 'm', to: '+4791234567' })
      }) as never
    )

    const res = await call(requestCode, ORG, { phone: '+4791234567' })
    expect(res.status).toBe(200)
    released?.()
  })

  it('never looks a technician up outside the workshop in the path', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([] as never)
    await call(requestCode, ORG, { phone: '+4791234567' })

    const where = vi.mocked(db.technician.findMany).mock.calls[0]?.[0]?.where
    // The number lives on the user, so the workshop scoping has to come from
    // this query. If it ever stops doing so, a phone becomes a global lookup.
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

    // Echoes what was asked for, not what was found.
    expect((await res.json()).data.channel).toBe('email')
    expect(sendOrgMail).toHaveBeenCalledWith(ORG, expect.objectContaining({ to: 'a@x.test' }))
    expect(sendOrgSms).not.toHaveBeenCalled()
  })

  it('replaces an outstanding code rather than adding one', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', user: { email: 'a@x.test', phone: '+4791234567' } },
    ] as never)

    await call(requestCode, ORG, { phone: '+4791234567' })

    expect(db.technicianLoginCode.deleteMany).toHaveBeenCalledWith({
      where: { technicianId: 'tech-1', usedAt: null },
    })
  })

  it('still answers success when delivery throws', async () => {
    vi.mocked(db.technician.findMany).mockResolvedValue([
      { id: 'tech-1', user: { email: 'a@x.test', phone: '+4791234567' } },
    ] as never)
    vi.mocked(sendOrgSms).mockRejectedValue(new Error('provider down'))

    const res = await call(requestCode, ORG, { phone: '+4791234567' })
    expect(res.status).toBe(200)
  })
})

describe('verifying a code', () => {
  const live = (overrides: Record<string, unknown> = {}) => ({
    id: 'code-1',
    codeHash: hashLoginCode(CODE),
    expiresAt: new Date(Date.now() + 60_000),
    attempts: 0,
    technician: { id: 'tech-1', isActive: true, userId: 'user-1', organizationId: ORG },
    ...overrides,
  })

  /** Whoever the caller claims to be resolves to this technician. */
  function claiming(technicianId: string | null = 'tech-1') {
    vi.mocked(db.technician.findMany).mockResolvedValue(
      (technicianId ? [{ id: technicianId, user: { phone: '+4791234567' } }] : []) as never
    )
  }

  beforeEach(() => {
    claiming()
    vi.mocked(db.technicianLoginCode.update).mockResolvedValue({ attempts: 1 } as never)
    vi.mocked(db.technicianLoginCode.delete).mockResolvedValue({} as never)
  })

  const verify = (body: unknown) => call(verifyCode, ORG, body)

  it('exchanges a good code for a session', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)

    const res = await verify({ code: CODE, phone: '+4791234567' })

    expect(await res.json()).toEqual({ data: { token: 'session-token', organizationId: ORG } })
    expect(createSession).toHaveBeenCalledWith('user-1', false)
  })

  it('finds the code by who is claiming it, inside this workshop', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    await verify({ code: CODE, phone: '+4791234567' })

    expect(db.technicianLoginCode.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG, technicianId: 'tech-1', usedAt: null },
      })
    )
  })

  it('accepts a code with the spaces a keyboard adds', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    const res = await verify({ code: ' 123 456 ', phone: '+4791234567' })
    expect(res.status).toBe(200)
  })

  it('charges a wrong guess to that one code, and nobody else', async () => {
    // The finding this replaces: a miss used to age every live code in the
    // workshop, so five wrong guesses from anyone who knew the workshop id
    // locked out every technician in the building.
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)

    const res = await verify({ code: '999999', phone: '+4791234567' })

    expect((await res.json()).error.code).toBe('invalid_code')
    expect(db.technicianLoginCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1' }, data: { attempts: { increment: 1 } } })
    )
    expect(db.technicianLoginCode.updateMany).not.toHaveBeenCalled()
    expect(db.technicianLoginCode.deleteMany).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('spends the code once the guesses run out, rather than letting it cool off', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    vi.mocked(db.technicianLoginCode.update).mockResolvedValue({ attempts: MAX_ATTEMPTS } as never)

    await verify({ code: '999999', phone: '+4791234567' })
    expect(db.technicianLoginCode.delete).toHaveBeenCalledWith({ where: { id: 'code-1' } })
  })

  it('refuses when the caller does not resolve to anybody here', async () => {
    claiming(null)

    const res = await verify({ code: CODE, phone: '+4700000000' })
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(db.technicianLoginCode.findFirst).not.toHaveBeenCalled()
  })

  it('refuses without an identifier at all', async () => {
    const res = await verify({ code: CODE })
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(db.technician.findMany).not.toHaveBeenCalled()
  })

  it('refuses a code belonging to another workshop', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({
        technician: { id: 't', isActive: true, userId: 'u', organizationId: OTHER_ORG },
      }) as never
    )

    const res = await verify({ code: CODE, phone: '+4791234567' })
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses somebody deactivated since the code was sent', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({ technician: { id: 't', isActive: false, userId: 'u', organizationId: ORG } }) as never
    )

    const res = await verify({ code: CODE, phone: '+4791234567' })
    expect((await res.json()).error.code).toBe('not_technician')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses somebody removed from the workshop since the code was sent', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    vi.mocked(db.organizationMember.findFirst).mockResolvedValue(null as never)

    const res = await verify({ code: CODE, phone: '+4791234567' })
    expect((await res.json()).error.code).toBe('not_technician')
  })

  it('refuses an expired code', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({ expiresAt: new Date(Date.now() - 1) }) as never
    )
    const res = await verify({ code: CODE, phone: '+4791234567' })
    expect((await res.json()).error.code).toBe('code_expired')
  })

  it('refuses once the attempt limit is reached', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(
      live({ attempts: MAX_ATTEMPTS }) as never
    )
    const res = await verify({ code: CODE, phone: '+4791234567' })
    expect((await res.json()).error.code).toBe('too_many_attempts')
  })

  it('burns the code before minting the session', async () => {
    vi.mocked(db.technicianLoginCode.findFirst).mockResolvedValue(live() as never)
    await verify({ code: CODE, phone: '+4791234567' })

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

    const res = await verify({ code: CODE, phone: '+4791234567' })
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(createSession).not.toHaveBeenCalled()
  })

  it('refuses anything that is not six digits without a lookup', async () => {
    for (const code of ['', '12345', '1234567', 'abcdef', null]) {
      const res = await verify({ code, phone: '+4791234567' })
      expect((await res.json()).error.code).toBe('invalid_code')
    }
    expect(db.technician.findMany).not.toHaveBeenCalled()
  })
})

describe('the rate limit on the way in', () => {
  it('cannot be shaken off with a made-up bearer token', async () => {
    // rateLimit prefers the Authorization header when there is one, which is
    // right for authenticated traffic and exactly wrong here: an endpoint
    // anybody can call will accept any token, so a caller rotating that value
    // used to get a fresh budget on every request. These endpoints ask for the
    // address alone.
    const { rateLimit: realRateLimit } =
      await vi.importActual<typeof import('@/lib/rate-limit')>('@/lib/rate-limit')

    const withToken = (token: string) =>
      new Request('https://shop.example.com/api/v1/tech/org/org-a/auth/verify', {
        method: 'POST',
        headers: { 'x-real-ip': '203.0.113.9', authorization: `Bearer ${token}` },
      })

    const opts = { limit: 2, windowMs: 60_000, anonymous: true }
    expect(realRateLimit(withToken('one'), opts)).toBeNull()
    expect(realRateLimit(withToken('two'), opts)).toBeNull()
    // Third call, third distinct token, and it is still refused.
    expect(realRateLimit(withToken('three'), opts)?.status).toBe(429)
  })
})
