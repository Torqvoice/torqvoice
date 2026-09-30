// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The stops the public demo leans on beyond demoGuard(): upload caps, the
 * better-auth endpoints it refuses, the shared account's session list, the
 * AI vendors, and the settings a visitor cannot write. Each module reads
 * DEMO_MODE once at import, so every test loads a fresh copy under the flag
 * it wants.
 */

const findManySessions = vi.hoisted(() => vi.fn())
const findManyConnections = vi.hoisted(() => vi.fn())
const findFirstConnection = vi.hoisted(() => vi.fn())
const findManySettings = vi.hoisted(() => vi.fn())

vi.mock('@/lib/db', () => ({
  db: {
    session: { findMany: findManySessions },
    integrationConnection: { findMany: findManyConnections, findFirst: findFirstConnection },
    appSetting: { findMany: findManySettings },
  },
}))
vi.mock('@/lib/cached-session', () => ({
  getCachedSession: async () => ({
    user: { id: 'demo-user' },
    session: { id: 'my-session' },
  }),
}))
vi.mock('@/lib/audit', () => ({ logAudit: async () => undefined }))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }))

async function load<T>(module: string, demo: boolean): Promise<T> {
  vi.resetModules()
  process.env.DEMO_MODE = demo ? 'true' : 'false'
  return (await import(module)) as T
}

beforeEach(() => {
  findManySessions.mockReset().mockResolvedValue([])
  findManyConnections.mockReset().mockResolvedValue([])
  findFirstConnection.mockReset().mockResolvedValue(null)
  findManySettings.mockReset().mockResolvedValue([])
})

afterEach(() => {
  delete process.env.DEMO_MODE
})

type UploadGuard = typeof import('@/lib/upload-guard')
const MB = 1024 * 1024

/** A fresh path per request, so one test's pace never limits the next. */
let counter = 0
function upload(bytes: number | null) {
  counter += 1
  const headers = new Headers({ 'x-real-ip': '203.0.113.7' })
  if (bytes !== null) headers.set('content-length', String(bytes))
  return new Request(`http://localhost/api/protected/upload/test-${counter}`, {
    method: 'POST',
    headers,
  })
}

describe('upload limits', () => {
  it('lowers a route limit to 25MB on the demo and leaves smaller ones alone', async () => {
    const { uploadLimit } = await load<UploadGuard>('@/lib/upload-guard', true)
    expect(uploadLimit(500 * MB)).toBe(25 * MB)
    expect(uploadLimit(5 * MB)).toBe(5 * MB)
  })

  it('keeps every route limit as it is off the demo', async () => {
    const { uploadLimit } = await load<UploadGuard>('@/lib/upload-guard', false)
    expect(uploadLimit(500 * MB)).toBe(500 * MB)
  })

  it('refuses a declared body over the effective limit before it is read, naming that limit', async () => {
    const { guardUpload } = await load<UploadGuard>('@/lib/upload-guard', true)
    const refused = guardUpload(upload(200 * MB), 500 * MB)
    expect(refused?.status).toBe(413)
    expect(await refused?.json()).toEqual({ error: 'File size must be under 25MB' })
  })

  it('lets through a body within the limit, or one that declares no length', async () => {
    const { guardUpload } = await load<UploadGuard>('@/lib/upload-guard', true)
    expect(guardUpload(upload(10 * MB), 500 * MB)).toBeNull()
    // The route's own check on the file holds this one to the same limit.
    expect(guardUpload(upload(null), 500 * MB)).toBeNull()
  })

  it('allows the multipart framing on top of the file', async () => {
    const { guardUpload } = await load<UploadGuard>('@/lib/upload-guard', false)
    expect(guardUpload(upload(5 * MB + 1024), 5 * MB)).toBeNull()
    expect(guardUpload(upload(6 * MB), 5 * MB)?.status).toBe(413)
  })

  it('caps how often one caller uploads to one route', async () => {
    const { guardUpload } = await load<UploadGuard>('@/lib/upload-guard', true)
    const url = `http://localhost/api/protected/upload/paced-${Date.now()}`
    const request = () =>
      new Request(url, { method: 'POST', headers: { 'x-real-ip': '203.0.113.8' } })
    for (let i = 0; i < 20; i++) expect(guardUpload(request(), 5 * MB)).toBeNull()
    expect(guardUpload(request(), 5 * MB)?.status).toBe(429)
  })
})

describe('better-auth endpoints on the demo', () => {
  it('refuses everything that changes the shared account or reaches other visitors', async () => {
    const { isDemoBlockedAuthPath } = await import('@/lib/demo-auth-paths')
    for (const path of [
      'change-password',
      'set-password',
      'request-password-reset',
      'reset-password',
      'reset-password/some-token',
      'two-factor/enable',
      'passkey/generate-register-options',
      'update-user',
      'change-email',
      'delete-user',
      'delete-user/callback',
      'send-verification-email',
      'link-social',
      'unlink-account',
      'list-accounts',
      'get-access-token',
      'refresh-token',
      'list-sessions',
      'revoke-session',
      'revoke-sessions',
      'revoke-other-sessions',
    ]) {
      expect(isDemoBlockedAuthPath(`/api/public/auth/${path}`), path).toBe(true)
    }
  })

  it('keeps signing in and out working', async () => {
    const { isDemoBlockedAuthPath } = await import('@/lib/demo-auth-paths')
    for (const path of ['sign-in/email', 'sign-out', 'get-session', 'callback/google']) {
      expect(isDemoBlockedAuthPath(`/api/public/auth/${path}`), path).toBe(false)
    }
  })

  it('matches whole path segments, not any path that starts the same', async () => {
    const { isDemoBlockedAuthPath } = await import('@/lib/demo-auth-paths')
    expect(isDemoBlockedAuthPath('/api/public/auth/update-user-something')).toBe(false)
  })
})

type SessionActions = typeof import('@/features/settings/Actions/sessionActions')

describe('signed-in devices', () => {
  it('lists only the caller’s own session on the demo, where every visitor is the same user', async () => {
    const { listMyDevices } = await load<SessionActions>(
      '@/features/settings/Actions/sessionActions',
      true
    )
    await listMyDevices()
    expect(findManySessions.mock.calls[0][0].where).toMatchObject({
      userId: 'demo-user',
      id: 'my-session',
    })
  })

  it('lists every session of the account elsewhere', async () => {
    const { listMyDevices } = await load<SessionActions>(
      '@/features/settings/Actions/sessionActions',
      false
    )
    await listMyDevices()
    expect(findManySessions.mock.calls[0][0].where).not.toHaveProperty('id')
  })
})

describe('AI on the demo', () => {
  it('reports no provider and never reads a stored key', async () => {
    const ai = await load<typeof import('@/features/integrations/Lib/ai')>(
      '@/features/integrations/Lib/ai',
      true
    )
    expect(await ai.aiSetup('org')).toBeNull()
    expect(await ai.isAiConfigured('org')).toBe(false)
    expect(await ai.configuredAiProvider('org')).toBeNull()
    expect(findManyConnections).not.toHaveBeenCalled()
    expect(findManySettings).not.toHaveBeenCalled()
  })

  it('offers no speech model, so the mic stays with the browser', async () => {
    const speech = await load<typeof import('@/features/integrations/Lib/speech')>(
      '@/features/integrations/Lib/speech',
      true
    )
    expect(await speech.speechSetup('org')).toBeNull()
    expect(await speech.configuredDictation('org')).toEqual({ available: false, mode: 'choice' })
    expect(findFirstConnection).not.toHaveBeenCalled()
  })

  it('refuses to build a vendor client at all', async () => {
    const { createClient, getAiConfig } = await load<typeof import('@/lib/ai')>('@/lib/ai', true)
    expect(() => createClient({ provider: 'openai', apiKey: 'sk-real', model: 'gpt-4o' })).toThrow(
      /disabled on the demo/
    )
    await expect(getAiConfig('org')).rejects.toThrow(/disabled on the demo/)
  })

  it('builds one as before off the demo', async () => {
    const { createClient } = await load<typeof import('@/lib/ai')>('@/lib/ai', false)
    expect(createClient({ provider: 'openai', apiKey: 'sk-real', model: 'gpt-4o' }).baseURL).toBe(
      'https://api.openai.com/v1'
    )
  })
})

describe('settings a demo visitor cannot write', () => {
  it('includes the licence, whose key the daily check would send to torqvoice.com', async () => {
    const { isDemoBlockedSettingKey } = await import('@/lib/demo')
    for (const key of ['license.key', 'license.token', 'license.valid', 'license.plan']) {
      expect(isDemoBlockedSettingKey(key), key).toBe(true)
    }
    expect(isDemoBlockedSettingKey('workshop.name')).toBe(false)
  })
})

describe('billing on torqvoice.com from the demo', () => {
  it('never makes the request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    process.env.TORQVOICE_SERVICE_SECRET = 'a-secret-long-enough'
    try {
      const { billingRequest } = await load<typeof import('@/lib/torqvoice-com')>(
        '@/lib/torqvoice-com',
        true
      )
      await expect(billingRequest('sync', {})).rejects.toThrow(/disabled on the demo/)
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      delete process.env.TORQVOICE_SERVICE_SECRET
      fetchSpy.mockRestore()
    }
  })
})
