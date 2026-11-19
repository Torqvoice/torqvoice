import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { PasswordFeedback, PasswordMatchFeedback } from '@/components/password-feedback'
import { checkPassword, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@/lib/password-rules'

function NewPasswordForm({ hint }: { hint?: string }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  return (
    <>
      <label htmlFor="pw">New password</label>
      <input
        id="pw"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        aria-describedby="pw-feedback"
      />
      <PasswordFeedback id="pw-feedback" password={password} hint={hint} />
      <label htmlFor="confirm">Confirm password</label>
      <input
        id="confirm"
        type="password"
        value={confirmation}
        onChange={(e) => setConfirmation(e.target.value)}
        aria-describedby="confirm-feedback"
      />
      <PasswordMatchFeedback
        id="confirm-feedback"
        password={password}
        confirmation={confirmation}
      />
    </>
  )
}

describe('password rules', () => {
  it('are the limits the server enforces: 8 to 128 characters, nothing else', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
    expect(PASSWORD_MAX_LENGTH).toBe(128)
    expect(checkPassword('')).toEqual({ status: 'empty' })
    expect(checkPassword('abc')).toEqual({ status: 'tooShort', remaining: 5 })
    expect(checkPassword('aaaaaaaa')).toEqual({ status: 'ok' })
    expect(checkPassword('a'.repeat(128))).toEqual({ status: 'ok' })
    expect(checkPassword('a'.repeat(130))).toEqual({ status: 'tooLong', over: 2 })
  })
})

describe('PasswordFeedback', () => {
  it('shows nothing while the field is empty', () => {
    render(<NewPasswordForm />)
    expect(document.getElementById('pw-feedback')).toBeEmptyDOMElement()
    expect(document.getElementById('confirm-feedback')).toBeEmptyDOMElement()
  })

  it('shows the hint it is given while the field is empty', () => {
    render(<NewPasswordForm hint="Must be at least 8 characters" />)
    expect(screen.getByText('Must be at least 8 characters')).toBeInTheDocument()
  })

  it('counts down the characters still needed while too short', async () => {
    const user = userEvent.setup()
    render(<NewPasswordForm hint="Must be at least 8 characters" />)
    const input = screen.getByLabelText('New password')
    await user.type(input, 'abc')
    expect(input).toHaveAccessibleDescription('Too short, 5 more characters')
    await user.type(input, 'defg')
    expect(input).toHaveAccessibleDescription('Too short, 1 more character')
  })

  it('confirms once the password is long enough', async () => {
    const user = userEvent.setup()
    render(<NewPasswordForm />)
    const input = screen.getByLabelText('New password')
    await user.type(input, 'abcdefgh')
    expect(input).toHaveAccessibleDescription('Password OK')
  })

  it('says when a pasted password is over the limit', async () => {
    const user = userEvent.setup()
    render(<NewPasswordForm />)
    const input = screen.getByLabelText('New password')
    await user.click(input)
    await user.paste('a'.repeat(PASSWORD_MAX_LENGTH + 3))
    expect(input).toHaveAccessibleDescription('Too long, 3 characters over the 128-character limit')
  })

  it('is a polite live region', () => {
    render(<NewPasswordForm />)
    expect(document.getElementById('pw-feedback')).toHaveAttribute('aria-live', 'polite')
    expect(document.getElementById('confirm-feedback')).toHaveAttribute('aria-live', 'polite')
  })
})

describe('PasswordMatchFeedback', () => {
  it('says whether the confirmation matches', async () => {
    const user = userEvent.setup()
    render(<NewPasswordForm />)
    await user.type(screen.getByLabelText('New password'), 'abcdefgh')
    const confirm = screen.getByLabelText('Confirm password')
    await user.type(confirm, 'abcd')
    expect(confirm).toHaveAccessibleDescription('Does not match the password above')
    await user.type(confirm, 'efgh')
    expect(confirm).toHaveAccessibleDescription('Passwords match')
  })
})
