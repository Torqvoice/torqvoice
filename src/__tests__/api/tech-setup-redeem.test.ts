import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The one endpoint on the tech API anybody on the internet can reach without
 * credentials, and it hands back a session. These are the ways it must refuse.
 */

// vi.mock is hoisted, so the spy has to be created inside the factory and
// pulled back out afterwards.
vi.mock('@/lib/auth', () => ({
  auth: {
    $context: Promise.resolve({ internalAdapter: { createSession: vi.fn() } }),
  },
}))

vi.mock('@/lib/db', () => ({
  db: {
    technicianSetupCode: { findUnique: vi.fn(), updateMany: vi.fn() },
    technician: { findFirst: vi.fn() },
  },
}))

vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))

import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { POST } from '@/app/api/v1/tech/setup/redeem/route'
import { generateSetupCode, hashSetupCode } from '@/features/team/Lib/appSetupCode'

const mockCreateSession = vi.mocked(
  (await auth.$context).internalAdapter.createSession as ReturnType<typeof vi.fn>
)
const findCode = vi.mocked(db.technicianSetupCode.findUnique)
const burnCode = vi.mocked(db.technicianSetupCode.updateMany)
const findTechnician = vi.mocked(db.technician.findFirst)

const CODE = 'ABCD2345'

function post(body: unknown) {
  return POST(
    new Request('https://shop.example.com/api/v1/tech/setup/redeem', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  )
}

/** A live, unredeemed code for an active technician. */
function live(overrides: Record<string, unknown> = {}) {
  return {
    id: 'code-1',
    userId: 'user-1',
    organizationId: 'org-1',
    expiresAt: new Date(Date.now() + 60_000),
    usedAt: null,
    organization: { name: 'Bay Street Motors' },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(rateLimit).mockReturnValue(null)
  findTechnician.mockResolvedValue({ id: 'tech-1' } as never)
  burnCode.mockResolvedValue({ count: 1 } as never)
  mockCreateSession.mockResolvedValue({ token: 'session-token-abc' })
})

describe('POST /api/v1/tech/setup/redeem', () => {
  it('exchanges a live code for a session', async () => {
    findCode.mockResolvedValue(live() as never)

    const res = await post({ code: CODE })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data).toEqual({
      token: 'session-token-abc',
      organizationId: 'org-1',
      workshop: 'Bay Street Motors',
    })
    expect(mockCreateSession).toHaveBeenCalledWith('user-1', false)
  })

  it('looks the code up by hash, never by its value', async () => {
    findCode.mockResolvedValue(live() as never)
    await post({ code: CODE })

    expect(findCode).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codeHash: hashSetupCode(CODE) } })
    )
    const query = JSON.stringify(findCode.mock.calls[0]?.[0])
    expect(query).not.toContain(CODE)
  })

  it('accepts the code as it is displayed, lower case and grouped', async () => {
    findCode.mockResolvedValue(live() as never)
    const res = await post({ code: ' abcd-2345 ' })

    expect(res.status).toBe(200)
    expect(findCode).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codeHash: hashSetupCode(CODE) } })
    )
  })

  it('refuses a code that does not exist', async () => {
    findCode.mockResolvedValue(null as never)

    const res = await post({ code: CODE })
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('invalid_code')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('refuses a code that has already been redeemed', async () => {
    findCode.mockResolvedValue(live({ usedAt: new Date() }) as never)

    const res = await post({ code: CODE })
    expect((await res.json()).error.code).toBe('code_used')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('refuses a code that has expired', async () => {
    findCode.mockResolvedValue(live({ expiresAt: new Date(Date.now() - 1) }) as never)

    const res = await post({ code: CODE })
    expect((await res.json()).error.code).toBe('code_expired')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('refuses when the person is no longer an active technician', async () => {
    // Issued this morning, deactivated at lunchtime, scanned this afternoon.
    findCode.mockResolvedValue(live() as never)
    findTechnician.mockResolvedValue(null as never)

    const res = await post({ code: CODE })
    expect((await res.json()).error.code).toBe('not_technician')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('lets exactly one of two phones scanning the same screen win', async () => {
    findCode.mockResolvedValue(live() as never)
    // The other phone got there first, so the conditional update matches nothing.
    burnCode.mockResolvedValue({ count: 0 } as never)

    const res = await post({ code: CODE })
    expect((await res.json()).error.code).toBe('code_used')
    expect(mockCreateSession).not.toHaveBeenCalled()
  })

  it('burns the code before minting anything', async () => {
    findCode.mockResolvedValue(live() as never)
    await post({ code: CODE })

    // Conditional on it still being unused, which is what makes the race safe.
    expect(burnCode).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1', usedAt: null } })
    )
    expect(burnCode.mock.invocationCallOrder[0]).toBeLessThan(
      mockCreateSession.mock.invocationCallOrder[0]
    )
  })

  it('refuses an empty or missing code without touching the database', async () => {
    for (const body of [{}, { code: '' }, { code: '  -- ' }, { code: 42 }]) {
      const res = await post(body)
      expect(res.status).toBe(400)
      expect((await res.json()).error.code).toBe('invalid_code')
    }
    expect(findCode).not.toHaveBeenCalled()
  })

  it('obeys the rate limiter before doing anything else', async () => {
    vi.mocked(rateLimit).mockReturnValue(
      new Response(null, { status: 429 }) as unknown as ReturnType<typeof rateLimit>
    )

    const res = await post({ code: CODE })
    expect(res.status).toBe(429)
    expect(findCode).not.toHaveBeenCalled()
  })

  it('never reveals which workshop or person a bad code was for', async () => {
    findCode.mockResolvedValue(null as never)
    const body = JSON.stringify(await (await post({ code: CODE })).json())

    expect(body).not.toContain('org-1')
    expect(body).not.toContain('user-1')
    expect(body).not.toContain('Bay Street Motors')
  })
})

describe('setup codes', () => {
  it('generates from an alphabet with no character anybody has to ask about', () => {
    for (let i = 0; i < 200; i++) {
      // No O/0, I/1 or S/5 — the pairs that get misheard across a workshop.
      expect(generateSetupCode()).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{8}$/)
    }
  })

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateSetupCode()))
    expect(seen.size).toBe(500)
  })

  it('hashes rather than stores, and the hash does not contain the code', () => {
    const code = generateSetupCode()
    const hash = hashSetupCode(code)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toContain(code)
    expect(hashSetupCode(code)).toBe(hash)
    expect(hashSetupCode(generateSetupCode())).not.toBe(hash)
  })
})
