import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fromStripeAmount,
  toPayPalValue,
  toStripeAmount,
} from '@/lib/payment-providers/vendor-amounts'

/**
 * What a customer is charged for an invoice, per currency.
 *
 * Stripe takes an integer in the currency's smallest unit, and that unit is
 * not a hundredth everywhere. Scaling a yen invoice by 100 charges the
 * customer a hundred times what the invoice says while the app records the
 * invoice amount as paid, so both directions are pinned here.
 */

const create = vi.fn()
const retrieve = vi.fn()

vi.mock('@/lib/payment-providers/vendor-hosts', () => ({
  stripeClient: () => ({ checkout: { sessions: { create, retrieve } } }),
  paypalApiBase: () => 'https://paypal.test',
}))

const { StripeProvider } = await import('@/lib/payment-providers/stripe')
const { PayPalProvider } = await import('@/lib/payment-providers/paypal')

describe('amounts sent to Stripe', () => {
  it('sends two-decimal currencies in hundredths', () => {
    expect(toStripeAmount(1250.5, 'USD')).toBe(125050)
    expect(toStripeAmount(19.99, 'NOK')).toBe(1999)
    expect(toStripeAmount(20412.9, 'NIO')).toBe(2041290)
  })

  it('sends zero-decimal currencies as they are', () => {
    expect(toStripeAmount(5000, 'JPY')).toBe(5000)
    expect(toStripeAmount(5000, 'jpy')).toBe(5000)
    for (const code of ['KRW', 'VND', 'CLP', 'PYG', 'XOF', 'XAF', 'XPF', 'RWF']) {
      expect(toStripeAmount(120000, code), code).toBe(120000)
    }
  })

  it('rounds a zero-decimal amount to whole units', () => {
    expect(toStripeAmount(1234.5, 'JPY')).toBe(1235)
    expect(toStripeAmount(1234.4, 'KRW')).toBe(1234)
  })

  it('sends kronur and Ugandan shillings as whole units in hundredths', () => {
    expect(toStripeAmount(5, 'ISK')).toBe(500)
    expect(toStripeAmount(12990.4, 'ISK')).toBe(1299000)
    expect(toStripeAmount(5, 'UGX')).toBe(500)
  })

  it('sends three-decimal currencies in thousandths ending in zero', () => {
    expect(toStripeAmount(5.12, 'KWD')).toBe(5120)
    expect(toStripeAmount(100, 'BHD')).toBe(100000)
    expect(toStripeAmount(19.99, 'JOD') % 10).toBe(0)
  })

  it('reads back exactly what it sent', () => {
    for (const [amount, code] of [
      [1250.5, 'USD'],
      [5000, 'JPY'],
      [120000, 'XOF'],
      [12990, 'ISK'],
      [5, 'UGX'],
      [5.12, 'KWD'],
      [42.75, 'HUF'],
    ] as const) {
      expect(fromStripeAmount(toStripeAmount(amount, code), code.toLowerCase()), code).toBe(amount)
    }
  })

  it('reads a session without a currency as hundredths', () => {
    expect(fromStripeAmount(125050, null)).toBe(1250.5)
  })
})

describe('the Stripe checkout', () => {
  const request = {
    invoiceNumber: 'INV-1',
    description: 'Service',
    successUrl: 'https://app.test/ok',
    cancelUrl: 'https://app.test/cancel',
    serviceRecordId: 'rec_1',
    orgId: 'org_1',
  }

  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: 'cs_1', url: 'https://stripe.test/pay' })
    retrieve.mockReset()
  })

  it('charges a yen invoice its own amount, not a hundred times it', async () => {
    await new StripeProvider('sk_test_x').createCheckout({
      ...request,
      amount: 5000,
      currency: 'JPY',
    })
    const priceData = create.mock.calls[0][0].line_items[0].price_data
    expect(priceData).toMatchObject({ currency: 'jpy', unit_amount: 5000 })
  })

  it('still charges a dollar invoice in cents', async () => {
    await new StripeProvider('sk_test_x').createCheckout({
      ...request,
      amount: 50,
      currency: 'USD',
    })
    expect(create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(5000)
  })

  it('records what a yen session was paid, in yen', async () => {
    retrieve.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 5000,
      currency: 'jpy',
      metadata: { serviceRecordId: 'rec_1', orgId: 'org_1' },
    })
    const result = await new StripeProvider('sk_test_x').verifyPayment('cs_1')
    expect(result).toMatchObject({ paid: true, amount: 5000 })
  })

  it('records what a dollar session was paid, in dollars', async () => {
    retrieve.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 5000,
      currency: 'usd',
      metadata: {},
    })
    const result = await new StripeProvider('sk_test_x').verifyPayment('cs_1')
    expect(result?.amount).toBe(50)
  })
})

describe('amounts sent to PayPal', () => {
  it('writes two decimals for most currencies', () => {
    expect(toPayPalValue(1250.5, 'USD')).toBe('1250.50')
    expect(toPayPalValue(19.99, 'NOK')).toBe('19.99')
  })

  it('writes whole units for the currencies PayPal takes no decimals in', () => {
    expect(toPayPalValue(5000, 'JPY')).toBe('5000')
    expect(toPayPalValue(42750.4, 'HUF')).toBe('42750')
    expect(toPayPalValue(800.5, 'TWD')).toBe('801')
  })

  it('puts the whole-unit value on a yen order', async () => {
    const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) =>
      String(url).includes('/oauth2/token')
        ? new Response(JSON.stringify({ access_token: 'token' }))
        : new Response(
            JSON.stringify({
              id: 'order_1',
              links: [{ rel: 'payer-action', href: 'https://paypal.test/pay' }],
            })
          )
    )
    vi.stubGlobal('fetch', fetchMock)
    try {
      await new PayPalProvider({
        clientId: 'id',
        clientSecret: 'secret',
        useSandbox: true,
      }).createCheckout({
        invoiceNumber: 'INV-1',
        description: 'Service',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/cancel',
        serviceRecordId: 'rec_1',
        orgId: 'org_1',
        amount: 5000,
        currency: 'JPY',
      })
      const order = fetchMock.mock.calls.find(([url]) => String(url).includes('/checkout/orders'))
      const body = JSON.parse(String(order?.[1]?.body))
      expect(body.purchase_units[0].amount).toEqual({ currency_code: 'JPY', value: '5000' })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
