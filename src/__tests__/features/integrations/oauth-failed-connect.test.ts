import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A sign-in the vendor refuses, or one the workshop walks away from, must
 * not break anything: a connection that worked keeps its tokens, the
 * vendor's reason is kept where the workshop and the server log can see it,
 * and the settings page does not ask the vendor for lists with no token.
 */

vi.mock('@/lib/with-auth', () => ({
  withAuth: (fn: (ctx: { organizationId: string; userId: string }) => unknown) =>
    fn({ organizationId: 'org-1', userId: 'user-1' }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(async () => ({
    userId: 'user-1',
    organizationId: 'org-1',
    isAdmin: true,
  })),
}))
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn() }))
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  // Every plan flag on: the gate is not what these tests are about.
  getFeatures: vi.fn().mockResolvedValue(new Proxy({}, { get: () => true })),
}))
vi.mock('@/features/integrations/Lib/vault', () => ({
  openCredentials: vi.fn((sealed: string | null | undefined) =>
    sealed ? (JSON.parse(sealed) as Record<string, unknown>) : {}
  ),
  sealCredentials: vi.fn((plain: Record<string, unknown>) => JSON.stringify(plain)),
}))
vi.mock('@/features/integrations/Lib/connections', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/integrations/Lib/connections')>()),
  appUrl: () => 'https://app.example.com',
  loadConnection: vi.fn(),
  setConnectionStatus: vi.fn(),
  writeLog: vi.fn(),
}))
vi.mock('@/lib/db', () => ({
  db: {
    integrationConnection: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}))

import { db } from '@/lib/db'
import { loadConnection, writeLog } from '@/features/integrations/Lib/connections'
import { getIntegrationRemoteOptions } from '@/features/integrations/Actions/integrationActions'
import { GET as start } from '@/app/api/integrations/[connector]/oauth/start/route'
import { GET as callback } from '@/app/api/integrations/[connector]/oauth/callback/route'

const findUnique = vi.mocked(db.integrationConnection.findUnique)
const upsert = vi.mocked(db.integrationConnection.upsert)
const update = vi.mocked(db.integrationConnection.update)

const LIVE_TOKENS = { accessToken: 'live-access', refreshToken: 'live-refresh', expiresAt: 1 }

function xeroRow(status: string, credentials: Record<string, unknown>) {
  return {
    id: 'conn-1',
    organizationId: 'org-1',
    connectorId: 'xero',
    status,
    oauthState: 'state-1',
    credentials: JSON.stringify(credentials),
    settings: {},
    state: {},
  }
}

const params = { params: Promise.resolve({ connector: 'xero' }) }
const env = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env.XERO_INTEGRATION_CLIENT_ID = 'platform-id'
  process.env.XERO_INTEGRATION_CLIENT_SECRET = 'platform-secret'
  upsert.mockResolvedValue({ id: 'conn-1' } as never)
  update.mockResolvedValue({} as never)
})
afterEach(() => {
  process.env = { ...env }
  vi.restoreAllMocks()
})

describe('reconnecting an OAuth connector', () => {
  it('keeps the tokens of a working connection until the new consent replaces them', async () => {
    findUnique.mockResolvedValue(xeroRow('active', LIVE_TOKENS) as never)

    const res = await start(
      new NextRequest('https://app.example.com/api/integrations/xero/oauth/start'),
      params
    )

    expect(res.headers.get('location')).toContain('login.xero.com')
    const saved = JSON.parse(String(upsert.mock.calls[0][0].update.credentials))
    expect(saved).toMatchObject({ accessToken: 'live-access', refreshToken: 'live-refresh' })
    expect(upsert.mock.calls[0][0].update.status).toBe('active')
  })
})

describe('a sign-in the vendor refuses', () => {
  it('keeps the reason for the workshop and the server log, and leaves the tokens alone', async () => {
    findUnique.mockResolvedValue(xeroRow('active', LIVE_TOKENS) as never)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 })
    )
    const serverLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await callback(
      new NextRequest(
        'https://app.example.com/api/integrations/xero/oauth/callback?code=c1&state=state-1'
      ),
      params
    )

    expect(res.headers.get('location')).toBe(
      'https://app.example.com/settings/integrations/xero?error=exchange'
    )
    expect(update).toHaveBeenCalledTimes(1)
    const data = update.mock.calls[0][0].data
    expect(data).toMatchObject({ lastError: 'invalid_client', status: 'active', oauthState: null })
    expect(data).not.toHaveProperty('credentials')
    expect(writeLog).toHaveBeenCalledWith('conn-1', 'error', 'The provider refused the sign-in', {
      error: 'invalid_client',
    })
    expect(serverLog).toHaveBeenCalledWith(expect.stringContaining('invalid_client'))
  })

  it('marks a connection that never worked as errored', async () => {
    findUnique.mockResolvedValue(xeroRow('pending', {}) as never)
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 })
    )
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await callback(
      new NextRequest(
        'https://app.example.com/api/integrations/xero/oauth/callback?code=c1&state=state-1'
      ),
      params
    )

    expect(update.mock.calls[0][0].data).toMatchObject({
      status: 'error',
      lastError: 'invalid_client',
    })
  })
})

describe('setting lists on a connection without tokens', () => {
  it('stays empty without asking the vendor', async () => {
    findUnique.mockResolvedValue(xeroRow('error', {}) as never)

    const res = await getIntegrationRemoteOptions('xero', 'organisations')

    expect(res).toEqual([])
    expect(loadConnection).not.toHaveBeenCalled()
  })

  it('asks the vendor once the connection has tokens', async () => {
    findUnique.mockResolvedValue(xeroRow('active', LIVE_TOKENS) as never)
    const organisations = vi.fn().mockResolvedValue([{ value: 't1', label: 'Shop Ltd' }])
    vi.mocked(loadConnection).mockResolvedValue({
      ctx: {},
      server: { remoteOptions: { organisations } },
    } as never)

    const res = await getIntegrationRemoteOptions('xero', 'organisations')

    expect(res).toEqual([{ value: 't1', label: 'Shop Ltd' }])
    expect(organisations).toHaveBeenCalled()
  })
})
