import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The error page's Try again reloads the page, and the error goes to PostHog.
 *
 * It used to call reset(), which drew the page again from what the tab
 * already had: an error from the server or from the tab's own state came
 * straight back, and a person pressed the button over and over to no effect.
 */

const reportError = vi.fn()
vi.mock('@/lib/analytics', () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}))

import ErrorPage from '@/app/error'

const originalLocation = window.location
const reload = vi.fn()

beforeEach(() => {
  reportError.mockReset()
  reload.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...originalLocation, reload },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
})

describe('error page', () => {
  it('reloads the whole page on Try again', () => {
    render(<ErrorPage error={new Error('boom')} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('reports the error with the digest that finds it in the server log', () => {
    const error = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: '2338407428',
    })
    render(<ErrorPage error={error} />)
    expect(reportError).toHaveBeenCalledWith(error, { error_page: 'page', digest: '2338407428' })
  })

  it('reports an error from the browser without a digest', () => {
    const error = new Error("Cannot read properties of undefined (reading 'map')")
    render(<ErrorPage error={error} />)
    expect(reportError).toHaveBeenCalledWith(error, { error_page: 'page', digest: null })
  })
})
