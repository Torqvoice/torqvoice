import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: {} }))

import { isCloudLinked, resetCloudLinkForTests } from '@/lib/torqvoice-com-link'

const T0 = 1_700_000_000_000

function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status })
}

beforeEach(() => {
  resetCloudLinkForTests()
  vi.stubEnv('TORQVOICE_SERVICE_SECRET', 'a-service-secret-that-is-long-enough')
  vi.stubEnv('TORQVOICE_MODE', 'cloud')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.torqvoice.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isCloudLinked', () => {
  it('is false without cloud mode or the secret, and never asks', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('TORQVOICE_MODE', '')
    expect(await isCloudLinked()).toBe(false)
    vi.stubEnv('TORQVOICE_MODE', 'cloud')
    vi.stubEnv('TORQVOICE_SERVICE_SECRET', '')
    expect(await isCloudLinked()).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('asks torqvoice.com once and remembers a yes for an hour', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(200, { linked: true, source: 'app' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await isCloudLinked(T0)).toBe(true)
    expect(await isCloudLinked(T0 + 30 * 60 * 1000)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://torqvoice.com/api/app/subscription/ping')
  })

  it('treats a refusal as a definite no, remembered for two minutes, then asks again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer(401, { error: 'Unauthorized' }))
      .mockResolvedValueOnce(answer(200, { linked: true, source: 'app' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await isCloudLinked(T0)).toBe(false)
    expect(await isCloudLinked(T0 + 60 * 1000)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Stale: the cached no is served and a fresh ask starts behind it.
    expect(await isCloudLinked(T0 + 3 * 60 * 1000)).toBe(false)
    await new Promise((r) => setTimeout(r, 0))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await isCloudLinked(T0 + 3 * 60 * 1000 + 1)).toBe(true)
  })

  it('stays linked when a later check cannot reach the site, and unlinks on a later refusal', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer(200, { linked: true, source: 'app' }))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(answer(403, { error: 'Unknown app origin' }))
    vi.stubGlobal('fetch', fetchMock)
    expect(await isCloudLinked(T0)).toBe(true)
    // An hour later the yes is stale: served as is while the site is asked.
    expect(await isCloudLinked(T0 + 2 * 60 * 60 * 1000)).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(await isCloudLinked(T0 + 2 * 60 * 60 * 1000 + 1)).toBe(true)
    // Another hour: the site now refuses, and that is believed.
    expect(await isCloudLinked(T0 + 4 * 60 * 60 * 1000)).toBe(true)
    await new Promise((r) => setTimeout(r, 0))
    expect(await isCloudLinked(T0 + 4 * 60 * 60 * 1000 + 1)).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('shares one request between concurrent callers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(200, { linked: true, source: 'app' }))
    vi.stubGlobal('fetch', fetchMock)
    await Promise.all([isCloudLinked(T0), isCloudLinked(T0), isCloudLinked(T0)])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
