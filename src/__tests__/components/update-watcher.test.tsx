import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.fn()
vi.mock('@/components/notice-toast', () => ({
  showNotice: (notice: unknown) => toast(notice),
}))

import {
  ACTION_NOT_FOUND_HEADER,
  isOutdatedActionError,
  UpdateWatcher,
} from '@/components/update-watcher'

/**
 * The server as an old tab sees it after a deploy: the version route answers
 * with the build it was loaded from, so only the action's answer gives the
 * deploy away.
 */
function answerActionNotFound() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes('/api/public/version')
      ? new Response(JSON.stringify({ version: 'build-1' }))
      : new Response('', { status: 404, headers: { [ACTION_NOT_FOUND_HEADER]: '1' } })
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

/** A save the way the app's handlers write it: the failure is caught and logged. */
async function saveAndCatch() {
  try {
    const response = await window.fetch('/work-orders', {
      method: 'POST',
      headers: { 'next-action': 'abc123' },
    })
    if (response.headers.get(ACTION_NOT_FOUND_HEADER) === '1') {
      throw new Error('Server Action "abc123" was not found on the server.')
    }
  } catch {
    // What reports-client and most other callers do with it
  }
}

function answerVersion(version: string) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ version })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function bringTabBack() {
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('isOutdatedActionError', () => {
  it('recognises the error Next throws for a server action of an older build', () => {
    const named = Object.assign(new Error('x'), { name: 'UnrecognizedActionError' })
    expect(isOutdatedActionError(named)).toBe(true)
    expect(
      isOutdatedActionError(new Error('Server Action "abc" was not found on the server.'))
    ).toBe(true)
    expect(isOutdatedActionError(new Error('Failed to find Server Action "abc"'))).toBe(true)
  })

  it('leaves every other error alone', () => {
    expect(isOutdatedActionError(new Error('Unauthorized'))).toBe(false)
    expect(isOutdatedActionError('Server Action was not found on the server')).toBe(false)
  })
})

describe('UpdateWatcher', () => {
  beforeEach(() => {
    toast.mockReset()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('offers a reload when the server runs another build', async () => {
    answerVersion('build-2')
    render(<UpdateWatcher version="build-1" />)
    bringTabBack()
    await flush()

    expect(toast).toHaveBeenCalledTimes(1)
    const [notice] = toast.mock.calls[0]
    expect(notice).toMatchObject({
      id: 'app-update',
      title: 'A new version is available',
      description: 'Reload the page to get the latest updates.',
      actionLabel: 'Reload',
      dismissLabel: 'Dismiss',
    })
  })

  it('says nothing while the build is the same', async () => {
    const fetchMock = answerVersion('build-1')
    render(<UpdateWatcher version="build-1" />)
    bringTabBack()
    await flush()

    expect(fetchMock).toHaveBeenCalledWith('/api/public/version', { cache: 'no-store' })
    expect(toast).not.toHaveBeenCalled()
  })

  it('also asks every five minutes while the tab stays open', async () => {
    const fetchMock = answerVersion('build-2')
    render(<UpdateWatcher version="build-1" />)
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000)
    })
    await flush()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('never asks on the dev server', async () => {
    const fetchMock = answerVersion('build-2')
    render(<UpdateWatcher version="development" />)
    bringTabBack()
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the toast at once when a caught save hits a server action that is gone', async () => {
    answerActionNotFound()
    render(<UpdateWatcher version="build-1" />)
    await saveAndCatch()
    await flush()

    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toMatchObject({ title: 'A new version is available' })
  })

  it('hands every response back untouched', async () => {
    answerActionNotFound()
    render(<UpdateWatcher version="build-1" />)
    const response = await window.fetch('/work-orders', { method: 'POST' })

    expect(response.status).toBe(404)
    expect(response.headers.get(ACTION_NOT_FOUND_HEADER)).toBe('1')
  })

  it('says nothing for an ordinary failed request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 500 }))
    )
    render(<UpdateWatcher version="build-1" />)
    await window.fetch('/work-orders', { method: 'POST' })
    await flush()

    expect(toast).not.toHaveBeenCalled()
  })

  it('puts fetch back when it unmounts', () => {
    const fetchMock = answerActionNotFound()
    const { unmount } = render(<UpdateWatcher version="build-1" />)
    expect(window.fetch).not.toBe(fetchMock)

    unmount()
    expect(window.fetch).toBe(fetchMock)
  })
})
