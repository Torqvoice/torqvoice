import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizeUrl,
  exchangeCode,
  needsRefresh,
  newCodeVerifier,
  newState,
  platformClient,
  redirectUriFor,
  refreshToken,
  resolveClient,
} from '@/features/integrations/Lib/oauth'
import { manifest as google } from '@/integrations/google-calendar/manifest'

const spec = google.auth.type === 'oauth2' ? google.auth : null
if (!spec) throw new Error('google manifest is not oauth2')

/**
 * One OAuth implementation serves every connector. Who owns the vendor app
 * decides which client id is used: the platform's from the environment, or
 * the workshop's own from its stored credentials.
 */
describe('integration oauth', () => {
  const env = { ...process.env }
  beforeEach(() => {
    delete process.env.GOOGLE_INTEGRATION_CLIENT_ID
    delete process.env.GOOGLE_INTEGRATION_CLIENT_SECRET
  })
  afterEach(() => {
    process.env = { ...env }
    vi.restoreAllMocks()
  })

  it('prefers the platform app and falls back to the tenant app', () => {
    expect(platformClient(spec)).toBeNull()
    expect(resolveClient(spec, {})).toBeNull()
    expect(resolveClient(spec, { clientId: 'ws', clientSecret: 's' })).toMatchObject({
      ownership: 'tenant',
      clientId: 'ws',
    })
    process.env.GOOGLE_INTEGRATION_CLIENT_ID = 'platform'
    process.env.GOOGLE_INTEGRATION_CLIENT_SECRET = 'ps'
    expect(resolveClient(spec, { clientId: 'ws', clientSecret: 's' })).toMatchObject({
      ownership: 'platform',
      clientId: 'platform',
    })
  })

  it('builds an authorize URL with scopes, state, extra params and PKCE', () => {
    const state = newState()
    const verifier = newCodeVerifier()
    const url = new URL(
      buildAuthorizeUrl({
        spec,
        client: { clientId: 'cid', clientSecret: 'x', ownership: 'platform' },
        redirectUri: redirectUriFor('https://shop.example.com/', 'google-calendar'),
        state,
        codeVerifier: verifier,
      })
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://shop.example.com/api/integrations/google-calendar/oauth/callback'
    )
    expect(url.searchParams.get('scope')).toContain('calendar.events')
    expect(url.searchParams.get('state')).toBe(state)
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('code_challenge')).not.toBe(verifier)
  })

  it('exchanges a code and keeps the refresh token across refreshes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: 'a1',
          refresh_token: 'r1',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 's',
        }),
        { status: 200 }
      )
    )
    const client = { clientId: 'cid', clientSecret: 'sec', ownership: 'tenant' as const }
    const creds = await exchangeCode({
      spec,
      client,
      code: 'code',
      redirectUri: 'https://x/cb',
      codeVerifier: 'v',
    })
    expect(creds.accessToken).toBe('a1')
    expect(creds.refreshToken).toBe('r1')
    expect(creds.expiresAt).toBeGreaterThan(Date.now() + 3_000_000)
    expect(creds.codeVerifier).toBeUndefined()
    const sent = new URLSearchParams(String(fetchMock.mock.calls[0][1]?.body))
    expect(sent.get('grant_type')).toBe('authorization_code')
    expect(sent.get('code_verifier')).toBe('v')

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'a2', expires_in: 3600 }), { status: 200 })
    )
    const refreshed = await refreshToken({ spec, client, credentials: creds })
    expect(refreshed.accessToken).toBe('a2')
    expect(refreshed.refreshToken).toBe('r1')
  })

  it('surfaces the vendor error message on a failed exchange', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad code' }), {
        status: 400,
      })
    )
    await expect(
      exchangeCode({
        spec,
        client: { clientId: 'c', clientSecret: 's', ownership: 'tenant' },
        code: 'x',
        redirectUri: 'https://x',
      })
    ).rejects.toThrow('Bad code')
  })

  it('sends client credentials as Basic auth when the vendor wants that', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'z1', refresh_token: 'zr', expires_in: 3600 }), {
        status: 200,
      })
    )
    const basicSpec = { ...spec, tokenAuth: 'basic' as const }
    await exchangeCode({
      spec: basicSpec,
      client: { clientId: 'zid', clientSecret: 'zsec', ownership: 'platform' },
      code: 'c',
      redirectUri: 'https://x/cb',
    })
    const init = fetchMock.mock.calls[0][1]
    const headers = new Headers(init?.headers)
    expect(headers.get('authorization')).toBe(`Basic ${Buffer.from('zid:zsec').toString('base64')}`)
    const sent = new URLSearchParams(String(init?.body))
    expect(sent.get('client_secret')).toBeNull()
    expect(sent.get('grant_type')).toBe('authorization_code')
  })

  it('knows when a token is about to expire', () => {
    expect(needsRefresh({ accessToken: '' })).toBe(true)
    expect(needsRefresh({ accessToken: 'a' })).toBe(false)
    expect(needsRefresh({ accessToken: 'a', expiresAt: Date.now() + 30_000 })).toBe(true)
    expect(needsRefresh({ accessToken: 'a', expiresAt: Date.now() + 600_000 })).toBe(false)
  })
})
