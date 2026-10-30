/**
 * @vitest-environment node
 *
 * A "Data only" backup carries REDACTED where each secret was. Restoring it
 * keeps whatever the install has now and tells the workshop which keys the
 * file left out.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  current: {} as Record<string, unknown[]>,
  calls: [] as { model: string; method: string; args: any }[],
}))

vi.mock('@/lib/db', () => {
  const tx = new Proxy(
    {},
    {
      get: (_target, model: string) =>
        new Proxy(
          {},
          {
            get: (_t, method: string) => async (args: any) => {
              state.calls.push({ model, method, args })
              if (method === 'findMany') return state.current[model] ?? []
              if (method === 'findFirst' || method === 'findUnique') return null
              return { count: 0 }
            },
          }
        ),
    }
  )
  return { db: { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) } }
})
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn(() => null) }))
vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: vi.fn(async () => ({ organizationId: 'org-1', userId: 'user-1', isAdmin: true })),
}))
vi.mock('@/lib/files/manager', () => ({ releaseFilesNotRestored: vi.fn(async () => undefined) }))
vi.mock('@/lib/upload-root', () => ({ uploadsRoot: () => '/tmp/uploads-test' }))

import { NextRequest } from 'next/server'
import { POST } from '@/app/api/protected/backup/import/route'
import { REDACTED } from '@/lib/backup/secrets'

function importJson(data: Record<string, unknown>) {
  return POST(
    new NextRequest('http://app.test/api/protected/backup/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), data }),
    })
  )
}

const created = (model: string) =>
  state.calls
    .filter((c) => c.model === model && c.method === 'createMany')
    .flatMap((c) => c.args.data)

beforeEach(() => {
  state.current = {}
  state.calls = []
})

describe('restoring a backup without secret keys', () => {
  it('keeps the install values, skips keys it has none for, and lists them', async () => {
    state.current.appSetting = [{ key: 'payment.stripe.secretKey', value: 'sk_now' }]

    const response = await importJson({
      settings: [
        { id: 's1', key: 'workshop.phone', value: '+47 123' },
        { id: 's2', key: 'payment.stripe.secretKey', value: REDACTED },
        { id: 's3', key: 'ai.apiKey', value: REDACTED },
      ],
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      redactedSettings: ['ai.apiKey', 'payment.stripe.secretKey'],
    })

    // Read before the table is cleared.
    const order = state.calls.map((c) => `${c.model}.${c.method}`)
    expect(order.indexOf('appSetting.findMany')).toBeLessThan(
      order.indexOf('appSetting.deleteMany')
    )
    const lookup = state.calls.find((c) => c.model === 'appSetting' && c.method === 'findMany')
    expect(lookup?.args.where).toEqual({
      organizationId: 'org-1',
      key: { in: ['payment.stripe.secretKey', 'ai.apiKey'] },
    })

    const rows = created('appSetting')
    expect(rows.map((r: any) => [r.key, r.value])).toEqual([
      ['workshop.phone', '+47 123'],
      ['payment.stripe.secretKey', 'sk_now'],
    ])
    expect(JSON.stringify(rows)).not.toContain(REDACTED)
  })

  it('restores secrets a full backup carries', async () => {
    state.current.appSetting = [{ key: 'ai.apiKey', value: 'sk-now' }]
    const response = await importJson({
      settings: [{ id: 's1', key: 'ai.apiKey', value: 'sk-backup' }],
    })
    expect(await response.json()).toEqual({ success: true, redactedSettings: [] })
    expect(created('appSetting').map((r: any) => r.value)).toEqual(['sk-backup'])
  })

  it('keeps the current webhook secret, or mints one', async () => {
    state.current.webhook = [{ id: 'w1', url: 'https://one.test', secret: 'whsec_now' }]

    await importJson({
      webhooks: [
        { id: 'w1', name: 'One', url: 'https://one.test', secret: REDACTED, events: '["*"]' },
        { id: 'w2', name: 'Two', url: 'https://two.test', secret: REDACTED, events: '["*"]' },
      ],
    })

    const rows = created('webhook')
    expect(rows[0].secret).toBe('whsec_now')
    expect(rows[1].secret).toMatch(/^whsec_[0-9a-f]{48}$/)
    expect(rows.every((r: any) => r.organizationId === 'org-1')).toBe(true)
  })
})
