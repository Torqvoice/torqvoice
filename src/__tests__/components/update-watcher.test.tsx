import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.fn()
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toast(...args) }))

import { isOutdatedActionError, reportIfOutdated, UpdateWatcher } from '@/components/update-watcher'

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
    const [title, options] = toast.mock.calls[0]
    expect(title).toBe('A new version is available')
    expect(options.action.label).toBe('Reload')
    expect(options.duration).toBe(Number.POSITIVE_INFINITY)
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

  it('shows the same toast when a save hits a server action that is gone', async () => {
    answerVersion('build-1')
    render(<UpdateWatcher version="build-1" />)
    expect(reportIfOutdated(new Error('Server Action "abc" was not found on the server.'))).toBe(
      true
    )
    await flush()

    expect(toast).toHaveBeenCalledTimes(1)
    expect(toast.mock.calls[0][0]).toBe('A new version is available')
  })
})
