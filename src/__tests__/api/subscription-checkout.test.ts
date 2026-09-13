import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn() },
  },
}))

import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { POST } from '@/app/api/protected/subscription/checkout/route'

const mockGetAuthContext = vi.mocked(getAuthContext)
const mockFindUser = vi.mocked(db.user.findUnique)

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/protected/subscription/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function setupAuth(isAdmin = true) {
  mockGetAuthContext.mockResolvedValue({
    userId: 'user-1',
    organizationId: 'org-1',
    role: isAdmin ? 'owner' : 'member',
    isAdmin,
    isSuperAdmin: false,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('TORQVOICE_SERVICE_SECRET', 'a-service-secret-that-is-long-enough')
  vi.stubEnv('TORQVOICE_MODE', 'cloud')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.torqvoice.com')
  vi.stubEnv('NEXT_PUBLIC_TORQVOICE_COM_URL', 'https://torqvoice.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/protected/subscription/checkout', () => {
  it('sends the buyer to the checkout page on torqvoice.com with a signed handoff', async () => {
    setupAuth()
    mockFindUser.mockResolvedValue({ email: 'owner@example.com', name: 'Owner' } as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    const url = new URL(data.url)
    expect(url.origin).toBe('https://torqvoice.com')
    expect(url.pathname).toBe('/checkout')
    const token = url.searchParams.get('token') ?? ''
    expect(token.startsWith('tvh1.')).toBe(true)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    expect(payload).toMatchObject({
      org: 'org-1',
      plan: 'pro',
      email: 'owner@example.com',
      appUrl: 'https://app.torqvoice.com',
    })
  })

  it('is for owners and admins only', async () => {
    setupAuth(false)
    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(403)
    expect(mockFindUser).not.toHaveBeenCalled()
  })

  it('rejects a plan it does not sell', async () => {
    setupAuth()
    const res = await POST(makeRequest({ plan: 'white-label' }))
    expect(res.status).toBe(400)
  })

  it('says so when billing is not configured, rather than minting a bad link', async () => {
    setupAuth()
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', '')
    const res = await POST(makeRequest({ plan: 'enterprise' }))
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/not configured/)
  })
})
