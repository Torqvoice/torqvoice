import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mockPush = vi.fn()
const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}))

vi.mock('@/components/auth-logo', () => ({ AuthLogo: () => null }))
// The trust-device checkbox is not what this file tests.
vi.mock('@/components/ui/checkbox', () => ({ Checkbox: () => null }))

const mockVerifyTotp = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    twoFactor: {
      verifyTotp: (...args: unknown[]) => mockVerifyTotp(...args),
      verifyBackupCode: vi.fn(),
    },
  },
}))

import VerifyTwoFactorPage from '@/app/(public)/auth/verify-2fa/page'
import { twoFactorUrlFor } from '@/lib/signed-out'

async function verifyAt(search: string) {
  window.history.replaceState(null, '', `/auth/verify-2fa${search}`)
  mockVerifyTotp.mockResolvedValue({ data: {}, error: null })
  render(<VerifyTwoFactorPage />)
  await userEvent.type(screen.getByLabelText('Authentication Code'), '123456')
  await userEvent.click(screen.getByRole('button', { name: 'Verify' }))
  await waitFor(() => expect(mockPush).toHaveBeenCalled())
}

describe('two-factor sign-in returns to the page it was for', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('goes back to Settings > Account after a new sign-in to add a passkey', async () => {
    await verifyAt(`?redirect=${encodeURIComponent('/settings/account')}`)
    expect(mockPush).toHaveBeenCalledWith('/settings/account')
  })

  it('goes to the dashboard when no page was asked for', async () => {
    await verifyAt('')
    expect(mockPush).toHaveBeenCalledWith('/')
  })

  it('never leaves the site for a redirect pointing elsewhere', async () => {
    await verifyAt(`?redirect=${encodeURIComponent('//evil.example/x')}`)
    expect(mockPush).toHaveBeenCalledWith('/')
  })
})

describe('twoFactorUrlFor', () => {
  it('carries the sign-in page redirect on to the two-factor page', () => {
    expect(twoFactorUrlFor(`?redirect=${encodeURIComponent('/settings/account')}`)).toBe(
      '/auth/verify-2fa?redirect=%2Fsettings%2Faccount'
    )
  })

  it('is the plain two-factor page without one, or with one off the site', () => {
    expect(twoFactorUrlFor('')).toBe('/auth/verify-2fa')
    expect(twoFactorUrlFor('?redirect=https%3A%2F%2Fevil.example')).toBe('/auth/verify-2fa')
  })
})
