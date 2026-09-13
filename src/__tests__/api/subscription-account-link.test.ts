import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { user: { findUnique: vi.fn() } } }))

import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { POST } from '@/app/api/protected/subscription/account-link/route'

const mockGetAuthContext = vi.mocked(getAuthContext)
const mockFindUser = vi.mocked(db.user.findUnique)

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
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/protected/subscription/account-link', () => {
  it('mints a short signed link naming the signed-in person and whether the app verified them', async () => {
    setupAuth()
    mockFindUser.mockResolvedValue({
      email: 'Owner@Example.com',
      name: 'Owner',
      emailVerified: false,
    } as never)
    const res = await POST()
    expect(res.status).toBe(200)
    const url = new URL((await res.json()).url)
    expect(url.origin).toBe('https://torqvoice.com')
    expect(url.pathname).toBe('/api/auth/sso/app-link')
    const token = url.searchParams.get('token') ?? ''
    expect(token.startsWith('tva1.')).toBe(true)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
    expect(payload).toMatchObject({
      sub: 'user-1',
      email: 'Owner@Example.com',
      emailVerified: false,
    })
    expect(payload.exp - payload.iat).toBe(120)
  })

  it('is for owners and admins only', async () => {
    setupAuth(false)
    expect((await POST()).status).toBe(403)
    expect(mockFindUser).not.toHaveBeenCalled()
  })

  it('needs a signed-in person, a configured link and an email address', async () => {
    mockGetAuthContext.mockResolvedValue(null)
    expect((await POST()).status).toBe(401)
    setupAuth()
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', '')
    expect((await POST()).status).toBe(500)
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', 'a-service-secret-that-is-long-enough')
    mockFindUser.mockResolvedValue({ email: '', name: '', emailVerified: false } as never)
    expect((await POST()).status).toBe(400)
  })
})
