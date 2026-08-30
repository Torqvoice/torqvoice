/**
 * Regression guard for the SSRF fix in POST /api/protected/fetch-metadata
 * (GHSA-cpp2-8rm9-f8c5). Locks in that:
 *   - the SSRF guard runs on the initial URL AND every redirect hop,
 *   - redirects are followed manually (redirect: "manual", not "follow"),
 *   - a blocked target (direct or via redirect) is rejected before fetch,
 *   - legitimate direct + redirecting URLs still return parsed metadata.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
}))

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}))

vi.mock('@/features/webhooks/Lib/ssrf', () => ({
  checkWebhookUrl: vi.fn(),
}))

import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { checkWebhookUrl } from '@/features/webhooks/Lib/ssrf'
import { POST } from '@/app/api/protected/fetch-metadata/route'
import type { NextRequest } from 'next/server'

const mockGetSession = vi.mocked(auth.api.getSession)
const mockCheck = vi.mocked(checkWebhookUrl)
const mockFetch = vi.fn()

function req(url: unknown): NextRequest {
  return { json: async () => ({ url }) } as unknown as NextRequest
}

function res(status: number, headers: Record<string, string> = {}, body = ''): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(headers),
    text: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', mockFetch)
  // resetAllMocks wipes implementations, so re-establish the default mocks.
  vi.mocked(headers).mockResolvedValue(new Headers())
  mockGetSession.mockResolvedValue({ user: { id: 'user-1' } } as never)
})

describe('POST /api/protected/fetch-metadata — SSRF guard', () => {
  it('returns 401 when unauthenticated (and never fetches)', async () => {
    mockGetSession.mockResolvedValue(null as never)
    const r = await POST(req('http://internal.local'))
    expect(r.status).toBe(401)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects a blocked target with 400 and never fetches it', async () => {
    mockCheck.mockResolvedValue({ ok: false, reason: 'private_ip' })
    const r = await POST(req('http://169.254.169.254/latest/meta-data/'))
    expect(r.status).toBe(400)
    expect(await r.json()).toEqual({ error: 'This URL is not allowed.' })
    expect(mockCheck).toHaveBeenCalledWith('http://169.254.169.254/latest/meta-data/')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns parsed metadata for a legitimate direct URL', async () => {
    mockCheck.mockResolvedValue({ ok: true })
    mockFetch.mockResolvedValue(
      res(200, { 'content-type': 'text/html' }, '<title>Example Domain</title>')
    )
    const r = await POST(req('https://example.com'))
    expect(r.status).toBe(200)
    expect((await r.json()).name).toBe('Example Domain')
    expect(mockFetch.mock.calls[0][1].redirect).toBe('manual')
  })

  it('follows a redirect and validates EVERY hop', async () => {
    mockCheck.mockResolvedValue({ ok: true })
    mockFetch
      .mockResolvedValueOnce(res(301, { location: 'https://final.example/page' }))
      .mockResolvedValueOnce(res(200, { 'content-type': 'text/html' }, '<title>Final Page</title>'))

    const r = await POST(req('http://start.example'))

    expect(r.status).toBe(200)
    expect((await r.json()).name).toBe('Final Page')
    expect(mockFetch).toHaveBeenCalledTimes(2)
    // Guard ran on both the initial URL and the redirect target.
    expect(mockCheck).toHaveBeenCalledWith('http://start.example')
    expect(mockCheck).toHaveBeenCalledWith('https://final.example/page')
    // Never delegates redirect-following to fetch.
    expect(mockFetch.mock.calls[0][1].redirect).toBe('manual')
  })

  it('blocks a redirect that points at an internal target (no second fetch)', async () => {
    mockCheck
      .mockResolvedValueOnce({ ok: true }) // initial public URL
      .mockResolvedValueOnce({ ok: false, reason: 'private_ip' }) // redirect target
    mockFetch.mockResolvedValueOnce(res(302, { location: 'http://127.0.0.1:5432/' }))

    const r = await POST(req('http://start.example'))

    expect(r.status).toBe(400)
    expect(mockFetch).toHaveBeenCalledTimes(1) // never fetched the internal target
    expect(mockCheck).toHaveBeenCalledWith('http://127.0.0.1:5432/')
  })

  it('stops with 422 on a redirect loop instead of following forever', async () => {
    mockCheck.mockResolvedValue({ ok: true })
    let n = 0
    mockFetch.mockImplementation(async () => res(302, { location: `https://hop.example/${n++}` }))
    const r = await POST(req('http://start.example'))
    expect(r.status).toBe(422)
    expect(await r.json()).toEqual({ error: 'Too many redirects' })
  })
})
