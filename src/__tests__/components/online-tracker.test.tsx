import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.fn()
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toast(...args) }))

import { OnlineTracker } from '@/components/online-tracker'

const assign = vi.fn()

function answerPing(status: number) {
  const fetchMock = vi.fn(async () => new Response('{}', { status }))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('OnlineTracker', () => {
  beforeEach(() => {
    toast.mockReset()
    assign.mockReset()
    vi.stubGlobal('location', {
      ...window.location,
      pathname: '/work-orders',
      search: '?status=pending',
      assign,
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('pings while the session is alive and stays put', async () => {
    const fetchMock = answerPing(200)
    render(<OnlineTracker />)
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/protected/ping', { method: 'POST' })
    expect(assign).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })

  it('sends an idle tab whose session is gone to sign-in, set to come back', async () => {
    answerPing(401)
    render(<OnlineTracker />)
    await flush()

    expect(assign).toHaveBeenCalledWith('/auth/sign-in?redirect=%2Fwork-orders%3Fstatus%3Dpending')
    expect(toast).not.toHaveBeenCalled()
  })

  it('asks instead of leaving when someone is typing', async () => {
    answerPing(200)
    render(<OnlineTracker />)
    await flush()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    answerPing(401)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await flush()

    expect(assign).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalledTimes(1)
    const [title, options] = toast.mock.calls[0]
    expect(title).toBe('You have been signed out')
    options.action.onClick()
    expect(assign).toHaveBeenCalledWith('/auth/sign-in?redirect=%2Fwork-orders%3Fstatus%3Dpending')
  })

  it('does nothing when the ping cannot reach the server', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      })
    )
    render(<OnlineTracker />)
    await flush()

    expect(assign).not.toHaveBeenCalled()
    expect(toast).not.toHaveBeenCalled()
  })
})
