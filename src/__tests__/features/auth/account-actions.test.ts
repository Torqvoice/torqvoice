import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock cached-session for withAuth
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: vi.fn(),
  getCachedMembership: vi.fn(),
}))

// Mock db
vi.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    verification: {
      upsert: vi.fn(),
    },
  },
}))

// Mock email
vi.mock('@/lib/email-verification-policy', () => ({ emailVerificationRequired: vi.fn() }))
vi.mock('@/lib/account-mail', () => ({ sendAccountMail: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/email', () => ({
  sendMail: vi.fn().mockResolvedValue(undefined),
  getFromAddress: vi.fn().mockResolvedValue('noreply@test.com'),
}))

import { requestEmailChange } from '@/features/settings/Actions/accountActions'
import { emailVerificationRequired } from '@/lib/email-verification-policy'
import { getCachedSession, getCachedMembership } from '@/lib/cached-session'
import { db } from '@/lib/db'

const mockGetCachedSession = vi.mocked(getCachedSession)
const mockGetCachedMembership = vi.mocked(getCachedMembership)
const mockFindUnique = vi.mocked(db.user.findUnique)
const mockFindFirst = vi.mocked(db.user.findFirst)
const mockUpdate = vi.mocked(db.user.update)
const mockUpsert = vi.mocked(db.verification.upsert)

const SESSION = { user: { id: 'user-1', email: 'user@example.com' } }
const MEMBERSHIP = {
  organizationId: 'org-1',
  role: 'admin',
  roleId: null,
  customRole: null,
}

function setupAuth() {
  mockGetCachedSession.mockResolvedValue(SESSION as any)
  mockFindUnique.mockResolvedValue({ isSuperAdmin: false } as any)
  mockGetCachedMembership.mockResolvedValue(MEMBERSHIP as any)
}

beforeEach(async () => {
  vi.resetAllMocks()
  // The strict install unless a test says otherwise, and a mail that sends.
  vi.mocked(emailVerificationRequired).mockResolvedValue(true)
  const { sendAccountMail } = await import('@/lib/account-mail')
  vi.mocked(sendAccountMail).mockResolvedValue(undefined)
})

describe('changing the address where the install does not require verification', () => {
  it('changes it at once, unverified, and tells the old address', async () => {
    const { sendAccountMail } = await import('@/lib/account-mail')
    setupAuth()
    vi.mocked(emailVerificationRequired).mockResolvedValue(false)
    mockFindFirst.mockResolvedValue(null)
    mockFindUnique.mockResolvedValue({ name: 'Anna', email: 'user@example.com' } as any)
    mockUpdate.mockResolvedValue({} as any)

    const result = await requestEmailChange({ email: 'new@example.com' })

    expect(result).toEqual({ success: true, data: { sent: false, email: 'new@example.com' } })
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { email: 'new@example.com', emailVerified: false },
    })
    expect(mockUpsert).not.toHaveBeenCalled()
    expect(sendAccountMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' })
    )
  })

  it('still refuses an address somebody else holds', async () => {
    setupAuth()
    vi.mocked(emailVerificationRequired).mockResolvedValue(false)
    mockFindFirst.mockResolvedValue({ id: 'other-user' } as any)
    const result = await requestEmailChange({ email: 'taken@example.com' })
    expect(result).toEqual({ success: false, error: 'Email is already in use' })
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('requestEmailChange', () => {
  it('returns Unauthorized when no session', async () => {
    mockGetCachedSession.mockResolvedValue(null)
    const result = await requestEmailChange({ email: 'new@example.com' })
    expect(result).toEqual({ success: false, error: 'Unauthorized' })
  })

  it('returns validation error for invalid email', async () => {
    setupAuth()
    const result = await requestEmailChange({ email: 'bad-email' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('email')
  })

  it('returns error when email is already in use', async () => {
    setupAuth()
    mockFindFirst.mockResolvedValue({ id: 'other-user' } as any)
    const result = await requestEmailChange({ email: 'taken@example.com' })
    expect(result).toEqual({ success: false, error: 'Email is already in use' })
  })

  it('returns error when user not found', async () => {
    setupAuth()
    mockFindFirst.mockResolvedValue(null)
    // findUnique is called twice: once by withAuth (isSuperAdmin), once by requestEmailChange (user lookup)
    // First call returns isSuperAdmin check, second returns null for user
    mockFindUnique.mockResolvedValueOnce({ isSuperAdmin: false } as any).mockResolvedValueOnce(null)
    const result = await requestEmailChange({ email: 'new@example.com' })
    expect(result).toEqual({ success: false, error: 'User not found' })
  })

  it('generates token, stores hash, and sends email to the new address', async () => {
    setupAuth()
    mockFindFirst.mockResolvedValue(null)
    // Second findUnique call returns user data
    mockFindUnique
      .mockResolvedValueOnce({ isSuperAdmin: false } as any)
      .mockResolvedValueOnce({ name: 'Test User', email: 'user@example.com' } as any)
    mockUpsert.mockResolvedValue({} as any)

    const result = await requestEmailChange({ email: 'new@example.com' })
    expect(result).toEqual({ success: true, data: { sent: true, email: 'new@example.com' } })

    // Verify upsert was called with the correct identifier pattern
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { identifier: 'email-change:user-1' },
        create: expect.objectContaining({
          identifier: 'email-change:user-1',
        }),
      })
    )

    // Verify the stored value contains tokenHash and email
    const upsertCall = mockUpsert.mock.calls[0][0]
    const storedValue = JSON.parse(upsertCall.create.value as string)
    expect(storedValue).toHaveProperty('tokenHash')
    expect(storedValue).toHaveProperty('email', 'new@example.com')

    // The link goes to the NEW address, and the current one is told.
    const { sendAccountMail } = await import('@/lib/account-mail')
    expect(sendAccountMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'new@example.com',
        link: expect.objectContaining({ url: expect.stringContaining('confirm-email-change') }),
      })
    )
    expect(sendAccountMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'user@example.com' })
    )
  })

  it('uses upsert to replace any existing pending change for the user', async () => {
    setupAuth()
    mockFindFirst.mockResolvedValue(null)
    mockFindUnique
      .mockResolvedValueOnce({ isSuperAdmin: false } as any)
      .mockResolvedValueOnce({ name: 'User', email: 'user@example.com' } as any)
    mockUpsert.mockResolvedValue({} as any)

    await requestEmailChange({ email: 'new@example.com' })

    // Upsert ensures only one pending change per user
    const upsertCall = mockUpsert.mock.calls[0][0]
    expect(upsertCall.where).toEqual({ identifier: 'email-change:user-1' })
    expect(upsertCall.update).toBeDefined()
    const updateValue = JSON.parse(upsertCall.update.value as string)
    expect(updateValue.email).toBe('new@example.com')
  })
})
