/**
 * Signing in to the portal when the request itself goes wrong.
 *
 * The form never says whether an account exists, but it used to say nothing
 * at all when the request failed: offline, rate limited or a server error all
 * looked like "check your email" for a mail that would never come.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}))

import { PortalLoginForm } from '@/features/portal/Components/PortalLoginForm'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }))

function askForLink(email = 'kari@example.com') {
  fireEvent.change(screen.getByLabelText('Your email address'), { target: { value: email } })
  fireEvent.click(screen.getByRole('button', { name: 'Send me a sign-in link' }))
}

describe('asking for a sign-in link by email', () => {
  it('says to check the email once the request was taken, account or not', async () => {
    fetchMock.mockReturnValue(reply(200, { success: true }))
    render(<PortalLoginForm orgId="shop" smsEnabled={false} defaultCountryCode={null} />)

    askForLink()

    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })

  it('says the request failed when there is no connection, and lets the customer try again', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    render(<PortalLoginForm orgId="shop" smsEnabled={false} defaultCountryCode={null} />)

    askForLink()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We could not send that just now. Check your connection and try again.'
    )
    expect(screen.queryByText('Check your email')).not.toBeInTheDocument()
    // The address is still there and the button sends it again.
    expect(screen.getByLabelText('Your email address')).toHaveValue('kari@example.com')
    fetchMock.mockReturnValueOnce(reply(200, { success: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Check your email')).toBeInTheDocument()
  })

  it('says to wait when there were too many tries', async () => {
    fetchMock.mockReturnValue(reply(429, { error: 'Too many requests' }))
    render(<PortalLoginForm orgId="shop" smsEnabled={false} defaultCountryCode={null} />)

    askForLink()

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many tries')
  })

  it('says the request failed when the server errors', async () => {
    fetchMock.mockReturnValue(reply(500))
    render(<PortalLoginForm orgId="shop" smsEnabled={false} defaultCountryCode={null} />)

    askForLink()

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send that just now')
  })
})

describe('signing in with a code by text message', () => {
  function openSms() {
    render(<PortalLoginForm orgId="shop" smsEnabled defaultCountryCode="+47" />)
    fireEvent.click(screen.getByRole('button', { name: 'SMS' }))
  }

  it('stays on the number and says so when the code could not be requested', async () => {
    fetchMock.mockReturnValue(reply(503))
    openSms()

    fireEvent.change(screen.getByLabelText('Your mobile number'), { target: { value: '41234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not send that just now')
    expect(screen.queryByLabelText('6-digit code')).not.toBeInTheDocument()
  })

  it('offers a new code a little while after the first one', async () => {
    fetchMock.mockImplementation(() => reply(200, { success: true }))
    openSms()

    fireEvent.change(screen.getByLabelText('Your mobile number'), { target: { value: '41234567' } })
    // The clock is faked from here, so the wait below is the only one.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    })
    expect(screen.getByLabelText('6-digit code')).toBeInTheDocument()

    const again = screen.getByRole('button', { name: 'Send a new code' })
    expect(again).toBeDisabled()
    await act(async () => {
      vi.advanceTimersByTime(30_000)
    })
    expect(again).toBeEnabled()
    vi.useRealTimers()

    fireEvent.click(again)
    await waitFor(() => expect(screen.getByText('We sent a new code.')).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ phone: '+4741234567' })
  })

  it('words a wrong code in the customer language, not the server words', async () => {
    fetchMock
      .mockImplementationOnce(() => reply(200, { success: true }))
      .mockImplementationOnce(() =>
        reply(400, { success: false, error: 'Invalid or expired code (server)' })
      )
    openSms()

    fireEvent.change(screen.getByLabelText('Your mobile number'), { target: { value: '41234567' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    fireEvent.change(await screen.findByLabelText('6-digit code'), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or expired code')
    expect(screen.queryByText(/\(server\)/)).not.toBeInTheDocument()
    expect(push).not.toHaveBeenCalled()
  })
})
