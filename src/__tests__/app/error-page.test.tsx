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

  it('shows the 500 page for a real error that mentions the network', () => {
    render(<ErrorPage error={new TypeError('Network error while saving the invoice')} />)
    expect(screen.getByText('500')).toBeInTheDocument()
    expect(screen.queryByText("Couldn't reach Torqvoice")).not.toBeInTheDocument()
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})

describe('error page for a lost connection', () => {
  // Chrome's words when a response stops arriving midway
  const cut = () => new TypeError('network error')

  it('says the connection was lost instead of showing the 500 page', () => {
    render(<ErrorPage error={cut()} reset={vi.fn()} />)
    expect(screen.getByRole('heading', { name: "Couldn't reach Torqvoice" })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Your last change may not have been saved. Check your connection and try again.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('500')).not.toBeInTheDocument()
    expect(screen.queryByText('Something Went Wrong')).not.toBeInTheDocument()
  })

  it('draws the page again in place on Try again, without a reload', () => {
    const reset = vi.fn()
    render(<ErrorPage error={cut()} reset={reset} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reset).toHaveBeenCalledTimes(1)
    expect(reload).not.toHaveBeenCalled()
  })

  it("prefers Next's retry, which also fetches the page again", () => {
    const reset = vi.fn()
    const retry = vi.fn()
    render(<ErrorPage error={cut()} reset={reset} retry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(reset).not.toHaveBeenCalled()
  })

  it('reloads when there is nothing to reset', () => {
    render(<ErrorPage error={cut()} />)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('is not reported as a crash', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(<ErrorPage error={new TypeError('Failed to fetch')} reset={vi.fn()} />)
    expect(reportError).not.toHaveBeenCalled()
  })
})
