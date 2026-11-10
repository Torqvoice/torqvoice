/**
 * The password card on the account page, for the two kinds of account.
 *
 * Someone who signed up with Google has no password. The card used to ask
 * them for their current one anyway and answer "Credential account not
 * found", and the two-factor card walked them into a password field they
 * could not fill in.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const setAccountPassword = vi.hoisted(() => vi.fn())
const changePassword = vi.hoisted(() => vi.fn())
const signOut = vi.hoisted(() => vi.fn())
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }))

vi.mock('sonner', () => ({ toast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({
    data: { user: { name: 'Google Person', email: 'google-person@x.test' } },
  }),
  authClient: {
    changePassword,
    signOut,
    updateUser: vi.fn(),
    sendVerificationEmail: vi.fn(),
    twoFactor: { enable: vi.fn(), disable: vi.fn(), verifyTotp: vi.fn() },
  },
}))
vi.mock('@/features/settings/Actions/setAccountPassword', () => ({ setAccountPassword }))
vi.mock('@/features/settings/Actions/accountActions', () => ({ requestEmailChange: vi.fn() }))
// The rest of the page: each has its own tests and its own server calls.
vi.mock('@/app/(authenticated)/settings/account/signed-in-devices', () => ({
  SignedInDevices: () => null,
}))
vi.mock('@/features/signatures/Components/SignatureCard', () => ({ SignatureCard: () => null }))
vi.mock('@/features/settings/Components/passkey-settings', () => ({
  PasskeySettings: () => null,
}))
vi.mock('qrcode.react', () => ({ QRCodeSVG: () => null }))

import { AccountSettings } from '@/app/(authenticated)/settings/account/account-settings'

const assign = vi.fn()

function renderPage(hasPassword: boolean) {
  return render(
    <AccountSettings
      twoFactorEnabled={false}
      emailVerified
      emailVerificationRequired={false}
      hasPassword={hasPassword}
      devices={[]}
      signature={null}
    />
  )
}

function typePasswords(first: string, second = first) {
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: first } })
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: second } })
}

beforeEach(() => {
  vi.clearAllMocks()
  setAccountPassword.mockResolvedValue({ success: true, data: { set: true } })
  changePassword.mockResolvedValue({ data: {}, error: null })
  signOut.mockResolvedValue({ data: {}, error: null })
  vi.stubGlobal('location', { ...window.location, assign })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('an account that signed up with Google and has no password', () => {
  it('is offered to set a password, and is not asked for a current one', () => {
    renderPage(false)

    expect(screen.getByText('Set a Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set Password' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Current Password')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Change Password' })).toBeNull()
  })

  it('sets the password, and from then on offers to change it', async () => {
    renderPage(false)
    typePasswords('correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }))

    await waitFor(() =>
      expect(setAccountPassword).toHaveBeenCalledWith({ newPassword: 'correct horse battery' })
    )
    // Never the call that answered "Credential account not found"
    expect(changePassword).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(
        'Password set. You can now sign in with your email address and this password.'
      )
    )

    expect(await screen.findByLabelText('Current Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change Password' })).toBeInTheDocument()
    expect(screen.getByLabelText('New Password')).toHaveValue('')
  })

  it('says to sign in again when the sign-in is too old, and takes them there and back', async () => {
    setAccountPassword.mockResolvedValue({
      success: false,
      error: 'Sign in again before setting a password.',
    })
    renderPage(false)
    typePasswords('correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }))

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('Sign in again before setting a password.')
    expect(toast.error).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    // The sign-in page sends a signed-in visitor straight back, so out first
    await waitFor(() => expect(signOut).toHaveBeenCalled())
    await waitFor(() =>
      expect(assign).toHaveBeenCalledWith('/auth/sign-in?redirect=%2Fsettings%2Faccount')
    )
    expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(assign.mock.invocationCallOrder[0])
  })

  it('sends nothing when the two passwords differ', () => {
    renderPage(false)
    typePasswords('correct horse battery', 'correct horse batteri')
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }))

    expect(toast.error).toHaveBeenCalledWith('Passwords do not match')
    expect(setAccountPassword).not.toHaveBeenCalled()
  })

  it('switches to changing the password when one turns out to exist already', async () => {
    // Set in another tab while this one was open
    setAccountPassword.mockResolvedValue({
      success: false,
      error: 'This account already has a password.',
    })
    renderPage(false)
    typePasswords('correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }))

    expect(await screen.findByLabelText('Current Password')).toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('says so when the password could not be set', async () => {
    setAccountPassword.mockRejectedValue(new TypeError('Failed to fetch'))
    renderPage(false)
    typePasswords('correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to set password'))
    // And the form is usable again
    expect(screen.getByRole('button', { name: 'Set Password' })).toBeEnabled()
  })

  it('cannot start two-factor until it has a password, and is told why', async () => {
    renderPage(false)

    expect(screen.getByRole('button', { name: 'Enable 2FA' })).toBeDisabled()
    expect(
      screen.getByText(
        'Two-factor authentication adds a code to signing in with a password. Set a password first.'
      )
    ).toBeInTheDocument()

    typePasswords('correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Set Password' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'Enable 2FA' })).toBeEnabled())
    expect(screen.queryByText(/Set a password first/)).toBeNull()
  })
})

describe('an account with a password', () => {
  it('changes it against the current one, as before', async () => {
    renderPage(true)

    expect(screen.queryByText('Set a Password')).toBeNull()
    fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'old-pass-1' } })
    typePasswords('correct horse battery')
    fireEvent.click(screen.getByRole('button', { name: 'Change Password' }))

    await waitFor(() =>
      expect(changePassword).toHaveBeenCalledWith({
        currentPassword: 'old-pass-1',
        newPassword: 'correct horse battery',
        revokeOtherSessions: true,
      })
    )
    expect(setAccountPassword).not.toHaveBeenCalled()
  })

  it('can start two-factor', () => {
    renderPage(true)

    expect(screen.getByRole('button', { name: 'Enable 2FA' })).toBeEnabled()
    expect(screen.queryByText(/Set a password first/)).toBeNull()
  })
})
