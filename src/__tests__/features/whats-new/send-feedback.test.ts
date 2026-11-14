/**
 * What a thumbs up or down sends to torqvoice.com.
 *
 * The panel promises a self-hosted workshop that nothing naming them goes
 * along, and tells a cloud workshop that their email does. This holds the
 * action to both sentences.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ctx = { userId: 'user-1', organizationId: 'org-1' }
vi.mock('@/lib/with-auth', () => ({
  withAuth: async (action: (c: typeof ctx) => Promise<unknown>) => {
    try {
      return { success: true, data: await action(ctx) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
}))
vi.mock('@/lib/db', () => ({
  db: {
    user: { findUnique: vi.fn(async () => ({ email: 'ingrid@fjordside.example' })) },
    organization: { findUnique: vi.fn(async () => ({ name: 'Fjordside Auto' })) },
  },
}))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'nb' }))
vi.mock('@/lib/demo', () => ({ demoGuard: () => undefined }))

let cloud = false
vi.mock('@/lib/features', () => ({ isCloudMode: () => cloud }))

const { sendWhatsNewFeedback } = await import('@/features/whats-new/Actions/sendWhatsNewFeedback')

const fetchMock = vi.fn(
  async (_url: string, _init: RequestInit) => new Response(null, { status: 204 })
)

function sentBody() {
  return JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body))
}

beforeEach(() => {
  cloud = false
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('BETTER_AUTH_SECRET', 'a-secret-for-the-test-only')
  vi.stubEnv('TORQVOICE_COM_URL', 'https://site.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('sending feedback on a highlight', () => {
  it('sends a self-hosted vote without anything that names the sender', async () => {
    const result = await sendWhatsNewFeedback({
      entryId: 'appointments',
      vote: 'down',
      comment: 'The reminder never arrived',
    })

    expect(result.success).toBe(true)
    expect(fetchMock.mock.calls[0][0]).toBe('https://site.test/api/app/whats-new/feedback')
    const body = sentBody()
    expect(body).toMatchObject({
      entryId: 'appointments',
      vote: 'down',
      comment: 'The reminder never arrived',
      mode: 'self-hosted',
      locale: 'nb',
    })
    expect(body.email).toBeUndefined()
    expect(body.workshop).toBeUndefined()
    expect(JSON.stringify(body)).not.toContain('user-1')
  })

  it('sends the email and workshop from the cloud, so the comment can be answered', async () => {
    cloud = true
    await sendWhatsNewFeedback({ entryId: 'appointments', vote: 'up', comment: 'Works well' })
    expect(sentBody()).toMatchObject({
      mode: 'cloud',
      email: 'ingrid@fjordside.example',
      workshop: 'Fjordside Auto',
    })
  })

  it('names nobody for a thumb on its own, even from the cloud', async () => {
    cloud = true
    await sendWhatsNewFeedback({ entryId: 'appointments', vote: 'up' })
    const body = sentBody()
    expect(body.email).toBeUndefined()
    expect(body.workshop).toBeUndefined()
  })

  it('gives one person the same key every time, so a second vote replaces the first', async () => {
    await sendWhatsNewFeedback({ entryId: 'appointments', vote: 'up' })
    const first = sentBody().voterKey
    await sendWhatsNewFeedback({ entryId: 'appointments', vote: 'down' })
    expect(sentBody().voterKey).toBe(first)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  it('reports a failure when torqvoice.com does not take it', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }))
    const result = await sendWhatsNewFeedback({ entryId: 'appointments', vote: 'up' })
    expect(result.success).toBe(false)
  })

  it('refuses a vote that is neither up nor down', async () => {
    const result = await sendWhatsNewFeedback({ entryId: 'appointments', vote: 'sideways' })
    expect(result.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
