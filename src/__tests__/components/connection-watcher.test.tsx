import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.fn()
vi.mock('@/components/notice-toast', () => ({
  showNotice: (notice: unknown) => toast(notice),
}))

import { ConnectionWatcher, isNetworkError } from '@/components/connection-watcher'

/**
 * What the browser hands the page when a server action call nobody caught
 * throws. Dispatched by hand, because a real rejected promise would fail the
 * test run itself.
 */
function failUncaught(reason: unknown) {
  const event = new Event('unhandledrejection')
  Object.defineProperty(event, 'reason', { value: reason })
  window.dispatchEvent(event)
}

const offline = () => new TypeError('Failed to fetch')

describe('isNetworkError', () => {
  it("recognises each browser's words for a request that never arrived", () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      true
    )
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
    expect(isNetworkError(new TypeError('The network connection was lost.'))).toBe(true)
  })

  it('leaves every other error alone', () => {
    expect(
      isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')"))
    ).toBe(false)
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false)
    expect(isNetworkError('Failed to fetch')).toBe(false)
  })
})

describe('ConnectionWatcher', () => {
  beforeEach(() => {
    toast.mockReset()
    vi.useFakeTimers({ toFake: ['Date'] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('says so when a click of the person did not reach the server', () => {
    render(<ConnectionWatcher />)
    fireEvent.pointerDown(document.body)
    failUncaught(offline())

    expect(toast).toHaveBeenCalledTimes(1)
    const [notice] = toast.mock.calls[0]
    expect(notice).toMatchObject({
      id: 'connection-lost',
      title: "Couldn't reach Torqvoice",
      description: 'Your last change may not have been saved. Check your connection and try again.',
      dismissLabel: 'Dismiss',
    })
    // Nothing to press: retrying is the person's call, on the screen they are on
    expect(notice).not.toHaveProperty('actionLabel')
  })

  it('also counts a keystroke, such as Enter in a form', () => {
    render(<ConnectionWatcher />)
    fireEvent.keyDown(document.body, { key: 'Enter' })
    failUncaught(offline())

    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('also counts a click on its own, the way a screen reader presses a button', () => {
    render(<ConnectionWatcher />)
    fireEvent.click(document.body)
    failUncaught(offline())

    expect(toast).toHaveBeenCalledTimes(1)
  })

  it('stays quiet about a request the page made by itself, like a laptop waking up', () => {
    render(<ConnectionWatcher />)
    failUncaught(offline())

    expect(toast).not.toHaveBeenCalled()
  })

  it('stays quiet once the last click is more than a minute old', () => {
    render(<ConnectionWatcher />)
    fireEvent.pointerDown(document.body)
    vi.setSystemTime(Date.now() + 61 * 1000)
    failUncaught(offline())

    expect(toast).not.toHaveBeenCalled()
  })

  it('leaves any other error to the screen that threw it', () => {
    render(<ConnectionWatcher />)
    fireEvent.pointerDown(document.body)
    failUncaught(new Error('Unauthorized'))
    failUncaught(new TypeError('x is not a function'))

    expect(toast).not.toHaveBeenCalled()
  })

  it('stops listening when the app unmounts', () => {
    const { unmount } = render(<ConnectionWatcher />)
    fireEvent.pointerDown(document.body)
    unmount()
    failUncaught(offline())

    expect(toast).not.toHaveBeenCalled()
  })
})
