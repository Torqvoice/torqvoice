import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { isNetworkError } from '@/lib/network-error'

/**
 * A lost connection gets the calm connection notice, never the 500 page, so
 * each browser's words for it must be recognised, and nothing else.
 */
describe('isNetworkError', () => {
  it.each([
    ['Chrome, no answer', 'Failed to fetch'],
    ['Chrome, no answer, with the host', 'Failed to fetch (app.torqvoice.com)'],
    ['Chrome, response cut off midway', 'network error'],
    ['Firefox', 'NetworkError when attempting to fetch resource.'],
    ['Safari', 'Load failed'],
    ['Safari, dropped mid-request', 'The network connection was lost.'],
    ['older Safari, offline', 'The Internet connection appears to be offline.'],
  ])('recognises %s: "%s"', (_browser, message) => {
    expect(isNetworkError(new TypeError(message))).toBe(true)
  })

  it('recognises a TypeError made in another realm', () => {
    // What an error thrown inside another frame is: neither this realm's
    // TypeError nor its Error.
    const foreign = runInNewContext('new TypeError("network error")')
    expect(foreign instanceof TypeError).toBe(false)
    expect(foreign instanceof Error).toBe(false)
    expect(isNetworkError(foreign)).toBe(true)
    expect(isNetworkError(runInNewContext('new Error("network error")'))).toBe(false)
  })

  it.each([
    'Network error while saving the invoice',
    'network error: invoice number already taken',
    'Could not sync: network error',
    'Failed to fetch dynamically imported module: https://app.torqvoice.com/_next/static/chunks/a.js',
    "Cannot read properties of undefined (reading 'id')",
  ])('leaves an application error alone: "%s"', (message) => {
    expect(isNetworkError(new TypeError(message))).toBe(false)
  })

  it('only counts what fetch throws, not an Error or a string with the same words', () => {
    expect(isNetworkError(new Error('network error'))).toBe(false)
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false)
    expect(isNetworkError('network error')).toBe(false)
    expect(isNetworkError(null)).toBe(false)
    expect(isNetworkError({ name: 'TypeError', message: 'network error' })).toBe(false)
  })
})
