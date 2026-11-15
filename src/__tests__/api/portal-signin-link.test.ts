import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The emailed portal sign-in link, and who gets to use it.
 *
 * Mail services open every link in a message before the reader does. When
 * opening the link was what signed in, that visit used the link up and the
 * customer landed on "already used" however fast they clicked. Opening it now
 * spends nothing; only the button on the page it leads to does.
 */

vi.mock('server-only', () => ({}))
vi.mock('@/lib/db', () => ({
  db: {
    customerMagicLink: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    customer: { findFirst: vi.fn() },
    customerSession: { create: vi.fn() },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/portal-slug', () => ({ resolvePortalOrg: vi.fn() }))

import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { GET, POST } from '@/app/(public)/portal/[orgId]/auth/verify/route'
import { SIGN_IN_ERROR_CODES, signInErrorMessageKey } from '@/features/portal/Lib/signInLink'
import portalMessages from '../../../messages/en/portal.json'

const loginMessages = portalMessages.login

const ORG = 'org-a'
const TOKEN = 'a'.repeat(64)
const BASE = `https://shop.example.com/portal/${ORG}/auth`
const params = { params: Promise.resolve({ orgId: ORG }) }

const link = (overrides: Record<string, unknown> = {}) => ({
  id: 'link-1',
  token: TOKEN,
  email: 'kari@example.com',
  organizationId: ORG,
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  ...overrides,
})

const open = (token = TOKEN) => GET(new Request(`${BASE}/verify?token=${token}`), params)

const press = (cookie: string | null = `customer-signin=${TOKEN}`, shownLink = 'link-1') =>
  POST(
    new Request(`${BASE}/verify`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
      body: new URLSearchParams({ link: shownLink }),
    }),
    params
  )

const cookiesOf = (res: Response) => res.headers.getSetCookie().join('\n')

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
  vi.mocked(resolvePortalOrg).mockResolvedValue({ id: ORG, name: 'Shop' } as never)
  vi.mocked(db.customerMagicLink.findUnique).mockResolvedValue(link() as never)
  vi.mocked(db.customerMagicLink.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(db.customer.findFirst).mockResolvedValue({ id: 'cust-1' } as never)
})

describe('opening the sign-in link', () => {
  it('leads to the page with the button and leaves the link unspent', async () => {
    const res = await open()

    expect(res.headers.get('location')).toBe(`${BASE}/confirm`)
    expect(db.customerMagicLink.updateMany).not.toHaveBeenCalled()
    expect(db.customerMagicLink.update).not.toHaveBeenCalled()
    expect(db.customerSession.create).not.toHaveBeenCalled()
    expect(cookiesOf(res)).not.toContain('customer-session=')
  })

  it('still works for the customer after a mail scanner has opened it first', async () => {
    await open() // the scanner
    await open() // the customer
    const res = await press()

    expect(res.headers.get('location')).toBe(`https://shop.example.com/portal/${ORG}/dashboard`)
    expect(cookiesOf(res)).toContain('customer-session=')
  })

  it('keeps the token out of the address of the page it leads to', async () => {
    const res = await open()

    expect(res.headers.get('location')).not.toContain(TOKEN)
    expect(cookiesOf(res)).toContain(`customer-signin=${TOKEN}`)
  })

  it.each([
    ['a link that was already used', { usedAt: new Date() }, 'used'],
    ['a link past its fifteen minutes', { expiresAt: new Date(Date.now() - 1000) }, 'expired'],
    ["another workshop's link", { organizationId: 'org-b' }, 'invalid'],
  ])('sends %s back to the login page with the reason as a code', async (_name, overrides, code) => {
    vi.mocked(db.customerMagicLink.findUnique).mockResolvedValue(link(overrides) as never)

    const res = await open()

    // A short code, which the login page words in the customer's language.
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=${code}`)
  })

  it('sends an address without a token back with a code, not English text', async () => {
    const res = await GET(new Request(`${BASE}/verify`), params)
    expect(res.headers.get('location')).toBe(`${BASE}/login?error=invalid`)
  })
})

describe('pressing Continue to sign in', () => {
  it('signs the customer in and spends the link', async () => {
    const res = await press()

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe(`https://shop.example.com/portal/${ORG}/dashboard`)
    expect(db.customerMagicLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'link-1', usedAt: null } })
    )
    expect(db.customerSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerId: 'cust-1', organizationId: ORG }),
      })
    )
    expect(cookiesOf(res)).toContain('customer-session=')
  })

  it('signs in once when the button is pressed twice at the same moment', async () => {
    vi.mocked(db.customerMagicLink.updateMany).mockResolvedValue({ count: 0 } as never)

    const res = await press()

    expect(res.headers.get('location')).toBe(`${BASE}/login?error=used`)
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })

  it('shows the page again instead of signing in as whoever opened a link in another tab', async () => {
    // The page was drawn for one customer; a second link opened since then
    // replaced the cookie, so the button no longer means what the page says.
    vi.mocked(db.customerMagicLink.findUnique).mockResolvedValue(
      link({ id: 'link-2', email: 'ola@example.com' }) as never
    )

    const res = await press(undefined, 'link-1')

    expect(res.headers.get('location')).toBe(`${BASE}/confirm`)
    expect(db.customerMagicLink.updateMany).not.toHaveBeenCalled()
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })

  it('signs nobody in when the browser never opened a link', async () => {
    const res = await press(null)

    expect(res.headers.get('location')).toContain(`${BASE}/login?error=`)
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })

  it('refuses a link that expired while the page was open', async () => {
    vi.mocked(db.customerMagicLink.findUnique).mockResolvedValue(
      link({ expiresAt: new Date(Date.now() - 1000) }) as never
    )

    const res = await press()

    expect(res.headers.get('location')).toBe(`${BASE}/login?error=expired`)
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })

  it('says the account is missing when the link outlived its customer', async () => {
    vi.mocked(db.customer.findFirst).mockResolvedValue(null)

    const res = await press()

    expect(res.headers.get('location')).toBe(`${BASE}/login?error=no-account`)
    expect(db.customerSession.create).not.toHaveBeenCalled()
  })
})

describe('the message the login page shows', () => {
  it('words every code the sign-in routes send', () => {
    for (const code of SIGN_IN_ERROR_CODES) {
      const key = signInErrorMessageKey(code)
      expect(key, code).not.toBeNull()
      expect(loginMessages.errors[key as keyof typeof loginMessages.errors], code).toEqual(
        expect.any(String)
      )
    }
    expect(loginMessages.errors.used).toContain('already been used')
  })

  it('shows nothing for text someone typed into the address', () => {
    expect(signInErrorMessageKey('Your account is locked, call +1 555 0100')).toBeNull()
    expect(signInErrorMessageKey('toString')).toBeNull()
    expect(signInErrorMessageKey(['used'])).toBeNull()
    expect(signInErrorMessageKey(undefined)).toBeNull()
  })
})
