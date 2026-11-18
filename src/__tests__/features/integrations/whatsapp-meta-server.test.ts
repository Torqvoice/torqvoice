import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectorContext } from '@/features/integrations/Lib/types'
import { MESSAGING_PROVIDERS } from '@/integrations/messaging/catalog'

/**
 * Meta sets WhatsApp up the other way round from every other vendor: the
 * callback URL must be verified before Meta issues a phone number ID, and
 * the callback only answers once the connection is live. These hold the
 * connector to that order: a verify token alone connects, the number and
 * token are checked against Meta once both are in, and one without the
 * other is refused with a reason.
 */

const { connector } = await import('@/integrations/whatsapp-meta/server')

const fetchMock = vi.fn<typeof fetch>()

function ctx(credentials: Record<string, string>): ConnectorContext {
  return {
    credentials,
    connection: {
      id: 'conn-1',
      organizationId: 'org-1',
      connectorId: 'whatsapp-meta',
      settings: {},
      state: {},
    },
  } as unknown as ConnectorContext
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('whatsapp-meta connector', () => {
  it('lets the phone number ID and access token wait, and asks for the rest', () => {
    const meta = MESSAGING_PROVIDERS.find((p) => p.id === 'whatsapp-meta')
    const byKey = Object.fromEntries((meta?.credentials ?? []).map((c) => [c.key, c]))
    expect(byKey.phoneNumberId.required).toBe(false)
    expect(byKey.phoneNumberId.deferrable).toBe(true)
    expect(byKey.accessToken.required).toBe(false)
    expect(byKey.accessToken.deferrable).toBe(true)
    expect(byKey.verifyToken.required).toBe(true)
    expect(byKey.appSecret.required).toBe(true)
  })

  it('connects on the verify token alone, without calling Meta', async () => {
    const result = await connector.test(ctx({ verifyToken: 'phrase', appSecret: 's' }))
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/phone number ID and access token/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still needs the verify token, since the webhook cannot answer without it', async () => {
    const result = await connector.test(ctx({ appSecret: 's' }))
    expect(result.ok).toBe(false)
    expect(result.message).toContain('verifyToken')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a phone number ID without its token, and the other way round', async () => {
    const noToken = await connector.test(ctx({ verifyToken: 'phrase', phoneNumberId: '123' }))
    expect(noToken.ok).toBe(false)
    expect(noToken.message).toContain('accessToken')

    const noNumber = await connector.test(ctx({ verifyToken: 'phrase', accessToken: 'EAA' }))
    expect(noNumber.ok).toBe(false)
    expect(noNumber.message).toContain('phoneNumberId')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('checks both against the Graph API once they are in', async () => {
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
    const result = await connector.test(
      ctx({ verifyToken: 'phrase', phoneNumberId: '123', accessToken: 'EAA' })
    )
    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledWith('https://graph.facebook.com/v21.0/123', {
      headers: { Authorization: 'Bearer EAA' },
    })
  })

  it("passes Meta's refusal back", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"error":{"message":"Invalid OAuth access token","code":190}}', {
        status: 400,
      })
    )
    const result = await connector.test(
      ctx({ verifyToken: 'phrase', phoneNumberId: '123', accessToken: 'bad' })
    )
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/Meta rejected the credentials \(400\)/)
  })

  it('names the account after the number, or nothing until there is one', async () => {
    await expect(connector.identify?.(ctx({ verifyToken: 'phrase' }))).resolves.toEqual({
      id: '',
      name: '',
    })
    await expect(
      connector.identify?.(ctx({ verifyToken: 'phrase', phoneNumberId: '123' }))
    ).resolves.toEqual({ id: '123', name: '123' })
  })
})
