import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Xero's webhook: one address for every connection on the same Xero app,
 * signed with that app's key. A delivery is only believed when the key of
 * the app that sent it signed it, and only that app's connections hear of
 * it, so one workshop's own app can never wake another workshop's sync.
 */

const findMany = vi.fn()
const enqueueJob = vi.fn()

vi.mock('@/lib/db', () => ({
  db: { integrationConnection: { findMany: (...a: unknown[]) => findMany(...a) } },
}))
vi.mock('@/features/integrations/Lib/jobs', () => ({
  enqueueJob: (...a: unknown[]) => enqueueJob(...a),
}))
// Credentials are stored sealed; here the "sealed" value is just JSON.
vi.mock('@/features/integrations/Lib/vault', () => ({
  openCredentials: (sealed: string | null) => (sealed ? JSON.parse(sealed) : {}),
}))

const { receiveXeroWebhook, signatureMatches } = await import('@/integrations/xero/webhook')

const PLATFORM_KEY = 'platform-webhook-key'
const sign = (body: string, key: string) => createHmac('sha256', key).update(body).digest('base64')

const delivery = (tenantId: string, category = 'PAYMENT') =>
  JSON.stringify({
    events: [
      {
        resourceId: 'r1',
        tenantId,
        tenantType: 'ORGANISATION',
        eventCategory: category,
        eventType: 'CREATE',
      },
    ],
    firstEventSequence: 1,
    lastEventSequence: 1,
    entropy: 'abc',
  })

beforeEach(() => {
  vi.stubEnv('XERO_INTEGRATION_WEBHOOK_KEY', PLATFORM_KEY)
  enqueueJob.mockReset()
  findMany.mockReset().mockResolvedValue([
    // On the platform's app.
    {
      id: 'cloud1',
      organizationId: 'org1',
      settings: { tenantId: 't-1' },
      credentials: JSON.stringify({ accessToken: 'a' }),
    },
    // A workshop with its own Xero app and webhook key.
    {
      id: 'own1',
      organizationId: 'org2',
      settings: { tenantId: 't-2' },
      credentials: JSON.stringify({ clientId: 'own', webhookKey: 'own-key' }),
    },
  ])
})

describe('Xero webhook', () => {
  it('checks the signature against the raw body', () => {
    const body = delivery('t-1')
    expect(signatureMatches(body, sign(body, PLATFORM_KEY), PLATFORM_KEY)).toBe(true)
    expect(signatureMatches(`${body} `, sign(body, PLATFORM_KEY), PLATFORM_KEY)).toBe(false)
    expect(signatureMatches(body, null, PLATFORM_KEY)).toBe(false)
  })

  it('answers Xero’s intent-to-receive check: 200 signed, 401 not', async () => {
    const body = JSON.stringify({
      events: [],
      firstEventSequence: 0,
      lastEventSequence: 0,
      entropy: 'x',
    })
    expect(await receiveXeroWebhook(body, sign(body, PLATFORM_KEY))).toEqual({
      status: 200,
      queued: 0,
    })
    expect(await receiveXeroWebhook(body, sign(body, 'wrong'))).toEqual({ status: 401, queued: 0 })
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it('queues a pull for the connection on the platform’s app that the event is about', async () => {
    const body = delivery('t-1')
    expect(await receiveXeroWebhook(body, sign(body, PLATFORM_KEY))).toEqual({
      status: 200,
      queued: 1,
    })
    expect(enqueueJob).toHaveBeenCalledWith({
      connectionId: 'cloud1',
      organizationId: 'org1',
      kind: 'accounting.pull',
      payload: { event: 'webhook' },
      idempotencyKey: 'accounting.pull:webhook',
    })
  })

  it('lets a workshop’s own app wake only that workshop', async () => {
    const own = delivery('t-2')
    expect(await receiveXeroWebhook(own, sign(own, 'own-key'))).toEqual({ status: 200, queued: 1 })
    expect(enqueueJob.mock.calls[0][0].connectionId).toBe('own1')

    // Its key cannot speak for the platform's connections...
    enqueueJob.mockReset()
    const forged = delivery('t-1')
    expect(await receiveXeroWebhook(forged, sign(forged, 'own-key'))).toEqual({
      status: 200,
      queued: 0,
    })
    // ...nor the platform's key for the workshop's own app.
    const other = delivery('t-2')
    expect(await receiveXeroWebhook(other, sign(other, PLATFORM_KEY))).toEqual({
      status: 200,
      queued: 0,
    })
    expect(enqueueJob).not.toHaveBeenCalled()
  })

  it('takes invoice events in any case, and ignores categories it does not sync', async () => {
    const invoice = delivery('t-1', 'Invoice')
    expect((await receiveXeroWebhook(invoice, sign(invoice, PLATFORM_KEY))).queued).toBe(1)
    const contact = delivery('t-1', 'CONTACT')
    expect((await receiveXeroWebhook(contact, sign(contact, PLATFORM_KEY))).queued).toBe(0)
  })
})
