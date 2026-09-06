import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'
import { PAYMENT_VENDORS, legacyPaymentKeys } from '@/integrations/payments/catalog'

const appSetting = { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn() }
const integrationConnection = {
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
}

vi.mock('@/lib/db', () => ({ db: { appSetting, integrationConnection } }))

const {
  PAYMENTS_ADOPTED_KEY,
  offeredPaymentProviders,
  paymentProviderFor,
  paymentSetups,
  paymentWebhook,
} = await import('@/features/integrations/Lib/payments')
const { openCredentials, sealCredentials } = await import('@/features/integrations/Lib/vault')

const ORG = 'org-1'

/** The rows a workshop with Stripe and Vipps switched on had before the move. */
function legacyRows(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    [SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED]: 'stripe,vipps',
    [SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY]: 'sk_live_old',
    [SETTING_KEYS.PAYMENT_STRIPE_PUBLISHABLE_KEY]: 'pk_live_old',
    [SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET]: 'whsec_old',
    [SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID]: 'vipps-id',
    [SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET]: 'vipps-secret',
    [SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY]: 'vipps-sub',
    [SETTING_KEYS.PAYMENT_VIPPS_MSN]: '123456',
    [SETTING_KEYS.PAYMENT_VIPPS_USE_TEST]: 'true',
    // PayPal keys present but the switch off: exactly what the old page
    // meant by "keep the keys, do not offer it".
    [SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_ID]: 'pp-id',
    [SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_SECRET]: 'pp-secret',
    ...overrides,
  }
  return Object.entries(values)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => ({ key, value, userId: 'user-1' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INTEGRATIONS_ENCRYPTION_KEY = 'a'.repeat(64)
  integrationConnection.findMany.mockResolvedValue([])
  integrationConnection.findUnique.mockResolvedValue(null)
  appSetting.findMany.mockResolvedValue([])
  integrationConnection.create.mockImplementation(async ({ data }) => ({
    id: `conn-${data.connectorId}`,
    status: data.status,
  }))
})

describe('payment catalog', () => {
  it('declares a vendor for every id the old enabled list could hold, in the order the buttons had', () => {
    expect(PAYMENT_VENDORS.map((v) => v.id)).toEqual(['stripe', 'vipps', 'paypal'])
  })

  it('names every old row it needs to read, once', () => {
    const keys = legacyPaymentKeys()
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys).toContain(SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED)
    expect(keys).toContain(SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET)
    expect(keys).toContain(SETTING_KEYS.PAYMENT_VIPPS_USE_TEST)
    expect(keys).toContain(SETTING_KEYS.PAYMENT_PAYPAL_USE_SANDBOX)
  })

  it('points each vendor at the webhook route that already exists', () => {
    expect(paymentWebhook('stripe', 'https://shop.example/')).toEqual({
      url: 'https://shop.example/api/webhooks/stripe',
      note: 'inboundHintStripe',
    })
    expect(paymentWebhook('vipps', 'https://shop.example')?.url).toBe(
      'https://shop.example/api/webhooks/vipps'
    )
    expect(paymentWebhook('paypal', 'https://shop.example')?.url).toBe(
      'https://shop.example/api/webhooks/paypal'
    )
    expect(paymentWebhook('zoom', 'https://shop.example')).toBeNull()
    expect(paymentWebhook('stripe', '')).toBeNull()
  })
})

/**
 * The move is only safe if a workshop that switched Vipps on last year keeps
 * taking Vipps payments without touching anything, so that is what these
 * check.
 */
describe('payment connections', () => {
  it('runs on active connections, with keys from the vault and defaults under the settings', async () => {
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-2',
        connectorId: 'paypal',
        credentials: sealCredentials({ clientId: 'pp', clientSecret: 'pps' }),
        settings: { sandbox: true },
      },
      {
        id: 'conn-1',
        connectorId: 'stripe',
        credentials: sealCredentials({ secretKey: 'sk_live_new' }),
        settings: {},
      },
    ])

    const setups = await paymentSetups(ORG)

    // Vendor order, not row order, so the buttons keep their places.
    expect(setups.map((s) => s.connectorId)).toEqual(['stripe', 'paypal'])
    expect(setups[0]).toMatchObject({
      connectionId: 'conn-1',
      credentials: { secretKey: 'sk_live_new' },
      settings: { enabled: true },
    })
    expect(setups[1].settings).toEqual({ enabled: true, sandbox: true })
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('adopts every vendor the old list had switched on, sealing the keys', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())

    const setups = await paymentSetups(ORG)

    expect(setups.map((s) => s.connectorId)).toEqual(['stripe', 'vipps'])
    expect(integrationConnection.create).toHaveBeenCalledTimes(2)

    const [stripe, vipps] = integrationConnection.create.mock.calls.map((c) => c[0].data)
    expect(stripe).toMatchObject({ organizationId: ORG, connectorId: 'stripe', status: 'active' })
    expect(stripe.credentials).not.toContain('sk_live_old')
    expect(openCredentials(stripe.credentials)).toEqual({
      secretKey: 'sk_live_old',
      publishableKey: 'pk_live_old',
      webhookSecret: 'whsec_old',
    })

    expect(vipps).toMatchObject({
      connectorId: 'vipps',
      settings: { testMode: true },
      externalAccountName: 'MSN 123456',
    })
    expect(openCredentials(vipps.credentials)).toEqual({
      clientId: 'vipps-id',
      clientSecret: 'vipps-secret',
      subscriptionKey: 'vipps-sub',
      merchantSerialNumber: '123456',
    })

    // Test mode carried over, so an adopted Vipps still talks to the test API.
    expect(setups[1].settings).toEqual({ enabled: true, testMode: true })

    // And recorded, so the next checkout does not adopt all over again.
    expect(appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId_key: { organizationId: ORG, key: PAYMENTS_ADOPTED_KEY } },
      })
    )
  })

  it('leaves a vendor with keys but the switch off alone', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())

    await paymentSetups(ORG)

    const adopted = integrationConnection.create.mock.calls.map((c) => c[0].data.connectorId)
    expect(adopted).not.toContain('paypal')
  })

  it('leaves a vendor switched on but never finished alone', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({ [SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY]: '' })
    )

    const setups = await paymentSetups(ORG)

    expect(setups.map((s) => s.connectorId)).toEqual(['stripe'])
    expect(integrationConnection.create).toHaveBeenCalledTimes(1)
  })

  it('adopts nothing when the old list was empty', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({ [SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED]: '' })
    )

    await expect(paymentSetups(ORG)).resolves.toEqual([])
    expect(integrationConnection.create).not.toHaveBeenCalled()
    expect(appSetting.upsert).not.toHaveBeenCalled()
  })

  it('adopts once: a disconnected vendor is not resurrected by the old rows', async () => {
    appSetting.findMany.mockResolvedValue([
      ...legacyRows(),
      { key: PAYMENTS_ADOPTED_KEY, value: '2026-09-04T00:00:00.000Z', userId: 'user-1' },
    ])

    await expect(paymentSetups(ORG)).resolves.toEqual([])
    expect(integrationConnection.create).not.toHaveBeenCalled()
  })

  it('never writes over a connection the workshop made themselves', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())
    integrationConnection.findUnique.mockImplementation(async ({ where }) =>
      where.organizationId_connectorId.connectorId === 'stripe' ? { id: 'conn-theirs' } : null
    )

    const setups = await paymentSetups(ORG)

    expect(setups.map((s) => s.connectorId)).toEqual(['vipps'])
    expect(integrationConnection.create).toHaveBeenCalledTimes(1)
  })

  it('uses the winner of a race on the first checkout after a deploy', async () => {
    appSetting.findMany.mockResolvedValue(
      legacyRows({ [SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED]: 'stripe' })
    )
    integrationConnection.create.mockRejectedValue({ code: 'P2002' })
    integrationConnection.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'conn-winner', status: 'active' })

    const setups = await paymentSetups(ORG)

    expect(setups).toHaveLength(1)
    expect(setups[0].connectionId).toBe('conn-winner')
  })

  it('falls back to the old rows when the vault cannot open a connection', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {
      // The fallback logs on purpose; the test only checks that it does.
    })
    integrationConnection.findMany.mockResolvedValue([
      { id: 'conn-1', connectorId: 'stripe', credentials: 'v1.bad.bad.bad', settings: {} },
    ])
    appSetting.findMany.mockResolvedValue(legacyRows())

    const setups = await paymentSetups(ORG)

    expect(setups).toHaveLength(1)
    expect(setups[0]).toMatchObject({
      connectionId: 'conn-1',
      credentials: { secretKey: 'sk_live_old' },
    })
    expect(quiet).toHaveBeenCalled()
    quiet.mockRestore()
  })

  it('builds the client for one vendor, and none for a vendor that is not connected', async () => {
    integrationConnection.findMany.mockResolvedValue([
      {
        id: 'conn-1',
        connectorId: 'stripe',
        credentials: sealCredentials({ secretKey: 'sk_live_new' }),
        settings: {},
      },
    ])

    const stripe = await paymentProviderFor(ORG, 'stripe')
    expect(stripe?.setup.connectionId).toBe('conn-1')
    expect(stripe?.provider.createCheckout).toBeTypeOf('function')
    await expect(paymentProviderFor(ORG, 'vipps')).resolves.toBeNull()
  })
})

/**
 * The shared invoice page asks which buttons to show on every view, and a
 * page render is no place to create a connection. Before the move is
 * adopted it reads the old rows as they stand, so the buttons are there on
 * the first view after the deploy exactly as they were on the last one
 * before it.
 */
describe('offered vendors', () => {
  it('reads the old rows without connecting anything', async () => {
    appSetting.findMany.mockResolvedValue(legacyRows())

    await expect(offeredPaymentProviders(ORG)).resolves.toEqual(['stripe', 'vipps'])
    expect(integrationConnection.create).not.toHaveBeenCalled()
    expect(appSetting.upsert).not.toHaveBeenCalled()
  })

  it('offers only what is connected and switched on, in vendor order', async () => {
    integrationConnection.findMany.mockResolvedValue([
      { connectorId: 'paypal', settings: {} },
      { connectorId: 'vipps', settings: { enabled: false } },
      { connectorId: 'stripe', settings: { enabled: true } },
    ])

    await expect(offeredPaymentProviders(ORG)).resolves.toEqual(['stripe', 'paypal'])
    expect(appSetting.findMany).not.toHaveBeenCalled()
  })

  it('offers nothing once the move is adopted and every vendor is gone', async () => {
    appSetting.findMany.mockResolvedValue([
      ...legacyRows(),
      { key: PAYMENTS_ADOPTED_KEY, value: '2026-09-04T00:00:00.000Z', userId: 'user-1' },
    ])

    await expect(offeredPaymentProviders(ORG)).resolves.toEqual([])
  })
})

/**
 * Online payments were behind the `payments` plan feature on their settings
 * page, and the catalog is behind `integrations`. Moving the cards must not
 * change who can reach them, so the connectors carry their own gate.
 */
describe('plan gates', () => {
  it('gates the payment connectors by the payments feature', async () => {
    const { connectorAllowed } = await import('@/features/integrations/Lib/plan')
    const { PLAN_FEATURES } = await import('@/lib/features')
    const { getManifest } = await import('@/integrations/registry')

    for (const id of ['stripe', 'vipps', 'paypal']) {
      const manifest = getManifest(id)
      expect(manifest?.plan).toBe('payments')
      expect(manifest?.category).toBe('payments')
      expect(connectorAllowed(manifest!, PLAN_FEATURES.free)).toBe(false)
      expect(connectorAllowed(manifest!, PLAN_FEATURES.pro)).toBe(true)
    }
  })
})
