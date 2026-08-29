import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guessing a customer's portal code.
 *
 * Six digits is a million, which sounds like plenty until a hundred machines
 * share the work between them and the only defence is a limit keyed on the
 * address each of them is using. What actually protects it is the code dying
 * after a handful of wrong guesses, which is what these cover.
 */

vi.mock('@/lib/db', () => ({
  db: {
    customerSmsCode: { findFirst: vi.fn(), update: vi.fn() },
    appSetting: { findUnique: vi.fn() },
    customer: { findFirst: vi.fn(), findMany: vi.fn() },
    customerSession: { create: vi.fn() },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/portal-slug', () => ({ resolvePortalOrg: vi.fn() }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => ({ set: vi.fn() })) }))

import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { POST } from '@/app/api/public/portal/[orgId]/auth/sms-verify/route'
import {
  generatePortalCode,
  hashPortalCode,
  portalCodeMatches,
  PORTAL_CODE_MAX_ATTEMPTS,
} from '@/lib/portal-code'

const ORG = 'org-a'
const CODE = '123456'

function verify(body: unknown) {
  return POST(
    new Request(`https://shop.example.com/api/public/portal/${ORG}/auth/sms-verify`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ orgId: ORG }) }
  )
}

const live = (overrides: Record<string, unknown> = {}) => ({
  id: 'code-1',
  code: hashPortalCode(CODE),
  attempts: 0,
  phone: '+4791234567',
  organizationId: ORG,
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(resolvePortalOrg).mockResolvedValue({ id: ORG, name: 'Shop' } as never)
  vi.mocked(db.appSetting.findUnique).mockResolvedValue({ value: '+47' } as never)
  vi.mocked(db.customerSmsCode.update).mockResolvedValue({ attempts: 1 } as never)
})

describe('a wrong portal code', () => {
  it('is charged to that code, not merely to the address', async () => {
    vi.mocked(db.customerSmsCode.findFirst).mockResolvedValue(live() as never)

    const res = await verify({ phone: '+4791234567', code: '999999' })

    expect(res.status).toBe(400)
    expect(db.customerSmsCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'code-1' }, data: { attempts: { increment: 1 } } })
    )
  })

  it('spends the code once the guesses run out', async () => {
    vi.mocked(db.customerSmsCode.findFirst).mockResolvedValue(live() as never)
    vi.mocked(db.customerSmsCode.update).mockResolvedValue({
      attempts: PORTAL_CODE_MAX_ATTEMPTS,
    } as never)

    await verify({ phone: '+4791234567', code: '999999' })

    // Marked used, so waiting out the rate limiter does not buy five more.
    expect(db.customerSmsCode.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { usedAt: expect.any(Date) } })
    )
  })

  it('refuses a code that has already run out, without another guess', async () => {
    vi.mocked(db.customerSmsCode.findFirst).mockResolvedValue(
      live({ attempts: PORTAL_CODE_MAX_ATTEMPTS }) as never
    )

    const res = await verify({ phone: '+4791234567', code: CODE })

    expect(res.status).toBe(400)
    expect(db.customerSmsCode.update).not.toHaveBeenCalled()
  })

  it('looks the row up by phone and workshop, never by the digits', async () => {
    vi.mocked(db.customerSmsCode.findFirst).mockResolvedValue(live() as never)
    await verify({ phone: '+4791234567', code: '999999' })

    const where = vi.mocked(db.customerSmsCode.findFirst).mock.calls[0]?.[0]?.where
    expect(where).toEqual(expect.objectContaining({ organizationId: ORG, usedAt: null }))
    // Matching on the code made a miss belong to nobody, so nothing counted it.
    expect(JSON.stringify(where)).not.toContain('999999')
  })
})

describe('portal codes at rest', () => {
  it('are stored as a hash, not as the digits', () => {
    const code = generatePortalCode()
    const stored = hashPortalCode(code)
    expect(stored).toMatch(/^[a-f0-9]{64}$/)
    expect(stored).not.toContain(code)
  })

  it('still match the code the customer types', () => {
    const code = generatePortalCode()
    expect(portalCodeMatches(hashPortalCode(code), code)).toBe(true)
    expect(portalCodeMatches(hashPortalCode(code), '000000')).toBe(false)
  })

  it('are six digits, from a real source of randomness', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generatePortalCode()))
    expect(seen.size).toBeGreaterThan(450)
    for (const c of seen) expect(c).toMatch(/^\d{6}$/)
  })
})
