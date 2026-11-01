/**
 * A sign-in that keeps failing.
 *
 * Someone refused twice for a wrong email or password has either forgotten
 * the password or never had an account; many arrive from the marketing
 * site's Login button. The form says so plainly after the second refusal,
 * with both ways out, and carries the address they typed to the next page
 * without putting it in the URL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => null }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/auth/sign-in',
}))

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
    className,
  }: {
    href: string
    children: React.ReactNode
    onClick?: () => void
    className?: string
  }) => (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        e.preventDefault()
        onClick?.()
      }}
    >
      {children}
    </a>
  ),
}))

vi.mock('@/components/auth/locale-switcher', () => ({ LocaleSwitcher: () => null }))

const signInEmail = vi.fn()
vi.mock('@/lib/auth-client', () => ({
  signIn: { email: (...args: unknown[]) => signInEmail(...args) },
  authClient: { signIn: { passkey: vi.fn() } },
}))

const { SignInForm } = await import('@/app/(public)/auth/sign-in/sign-in-form')
const { takeHandedEmail } = await import('@/lib/auth-email-handoff')

/** What Better Auth answers for a wrong email or password. */
const REFUSED = {
  error: { status: 401, code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' },
}

async function attempt(user: ReturnType<typeof userEvent.setup>, email: string) {
  const emailInput = screen.getByLabelText('Email')
  await user.clear(emailInput)
  await user.type(emailInput, email)
  await user.type(screen.getByLabelText('Password'), 'wrong-password')
  await user.click(screen.getByRole('button', { name: 'Sign In' }))
  await screen.findByText('Invalid email or password')
}

beforeEach(() => {
  signInEmail.mockReset()
  sessionStorage.clear()
})

describe('SignInForm after failed attempts', () => {
  it('keeps the small reset hint after one refusal', async () => {
    signInEmail.mockResolvedValue(REFUSED)
    render(<SignInForm registrationDisabled={false} />)
    const user = userEvent.setup()

    await attempt(user, 'sam@example.com')

    expect(screen.getByRole('link', { name: 'Reset it here' })).toBeInTheDocument()
    expect(screen.queryByText("Still can't sign in?")).not.toBeInTheDocument()
  })

  it('offers a reset and an account after the second refusal', async () => {
    signInEmail.mockResolvedValue(REFUSED)
    render(<SignInForm registrationDisabled={false} />)
    const user = userEvent.setup()

    await attempt(user, 'sam@example.com')
    await attempt(user, 'sam@example.com')

    expect(screen.getByText("Still can't sign in?")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Reset your password/ })).toHaveAttribute(
      'href',
      '/auth/forgot-password'
    )
    const signUp = screen.getByRole('link', { name: /Create an account/ })
    expect(signUp).toHaveAttribute('href', '/auth/sign-up')
    expect(signUp).toHaveTextContent('No account with sam@example.com yet? Create one.')
    expect(screen.queryByRole('link', { name: 'Reset it here' })).not.toBeInTheDocument()
  })

  it('hands the typed address to the next page, not to the URL', async () => {
    signInEmail.mockResolvedValue(REFUSED)
    render(<SignInForm registrationDisabled={false} />)
    const user = userEvent.setup()

    await attempt(user, 'sam@example.com')
    await attempt(user, 'sam@example.com')
    await user.click(screen.getByRole('link', { name: /Reset your password/ }))

    expect(takeHandedEmail()).toBe('sam@example.com')
    // Read once: a later visit starts empty.
    expect(takeHandedEmail()).toBe('')
  })

  it('leaves out the account offer where nobody can sign up', async () => {
    signInEmail.mockResolvedValue(REFUSED)
    render(<SignInForm registrationDisabled />)
    const user = userEvent.setup()

    await attempt(user, 'sam@example.com')
    await attempt(user, 'sam@example.com')

    expect(screen.getByRole('link', { name: /Reset your password/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Create an account/ })).not.toBeInTheDocument()
  })

  it('does not count a refusal for another reason', async () => {
    signInEmail.mockResolvedValue({ error: { status: 429, message: 'Too many requests' } })
    render(<SignInForm registrationDisabled={false} />)
    const user = userEvent.setup()

    for (let i = 0; i < 2; i++) {
      await user.type(screen.getByLabelText('Email'), 'sam@example.com')
      await user.type(screen.getByLabelText('Password'), 'pw')
      await user.click(screen.getByRole('button', { name: 'Sign In' }))
      await screen.findByText('Too many attempts, try again later.')
      await user.clear(screen.getByLabelText('Email'))
    }

    expect(screen.queryByText("Still can't sign in?")).not.toBeInTheDocument()
  })
})
