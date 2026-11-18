import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const headerValues = new Map<string, string>()
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => headerValues.get(name) ?? null }),
}))

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`)
})
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

import proxy from '@/proxy'
import { REQUEST_PATH_HEADER } from '@/lib/request-path'
import { redirectToSignIn } from '@/lib/sign-in-redirect.server'

describe('proxy on a page request', () => {
  function forwardedPath(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
    const response = proxy(new NextRequest(url, init))
    // NextResponse.next({ request: { headers } }) hands the overrides on as
    // x-middleware-request-* response headers.
    return response?.headers.get(`x-middleware-request-${REQUEST_PATH_HEADER}`)
  }

  it('passes on the path and query the browser asked for', () => {
    expect(forwardedPath('https://app.example/work-orders?status=pending')).toBe(
      '/work-orders?status=pending'
    )
  })

  it("drops Next's own _rsc marker from a client navigation", () => {
    expect(forwardedPath('https://app.example/work-orders?_rsc=abc12')).toBe('/work-orders')
  })

  it('overwrites a value the client sent itself', () => {
    expect(
      forwardedPath('https://app.example/quotes', {
        headers: { [REQUEST_PATH_HEADER]: '//evil.example' },
      })
    ).toBe('/quotes')
  })

  it('leaves the API to its own handling', () => {
    expect(forwardedPath('https://app.example/api/protected/ping')).toBeFalsy()
  })
})

describe('redirectToSignIn', () => {
  beforeEach(() => {
    headerValues.clear()
    redirect.mockClear()
  })

  it('sends the visitor to sign-in, set to come back to the page they asked for', async () => {
    headerValues.set(REQUEST_PATH_HEADER, '/work-orders?status=pending')
    await expect(redirectToSignIn()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith(
      '/auth/sign-in?redirect=%2Fwork-orders%3Fstatus%3Dpending'
    )
  })

  it('is the plain sign-in page without the header', async () => {
    await expect(redirectToSignIn()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/auth/sign-in')
  })

  it('never sends anyone off the site', async () => {
    headerValues.set(REQUEST_PATH_HEADER, '//evil.example/x')
    await expect(redirectToSignIn()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirect).toHaveBeenCalledWith('/auth/sign-in')
  })
})
