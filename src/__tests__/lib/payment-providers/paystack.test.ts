/**
 * @vitest-environment node
 */
import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PaystackProvider,
  paystackConfigFrom,
  paystackSignatureValid,
} from '@/lib/payment-providers/paystack'

/**
 * What Paystack is asked for and what is believed of its answer. A wrong
 * amount charges a customer the wrong money, and a wrong reading of the
 * answer books a payment nobody made, so both are pinned here.
 */

const fetchMock = vi.fn()

function answer(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const REQUEST = {
  amount: 1250.5,
  currency: 'zar',
  invoiceNumber: 'INV-1001',
  description: 'Payment for INV-1001 - Brake service',
  successUrl: 'https://shop.example/share/invoice/org_1/tok',
  cancelUrl: 'https://shop.example/share/invoice/org_1/tok',
  serviceRecordId: 'sr_1',
  orgId: 'org_1',
  payerEmail: 'thandi@example.com',
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.PAYSTACK_API_BASE_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('starting a Paystack checkout', () => {
  it('asks for the amount in cents, for this invoice, and sends the customer to the link Paystack gives', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/abc',
          reference: 'ref_from_paystack',
        },
      })
    )

    const result = await new PaystackProvider({ secretKey: 'sk_test_x' }).createCheckout(REQUEST)

    expect(result).toEqual({
      redirectUrl: 'https://checkout.paystack.com/abc',
      externalId: 'ref_from_paystack',
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.paystack.co/transaction/initialize')
    expect(init.headers.Authorization).toBe('Bearer sk_test_x')
    const sent = JSON.parse(init.body)
    expect(sent).toMatchObject({
      email: 'thandi@example.com',
      amount: 125050,
      currency: 'ZAR',
      callback_url: 'https://shop.example/share/invoice/org_1/tok?paystack=return',
      metadata: { serviceRecordId: 'sr_1', orgId: 'org_1', invoiceNumber: 'INV-1001' },
    })
    // Paystack allows only these characters in a reference.
    expect(sent.reference).toMatch(/^[A-Za-z0-9.=-]+$/)
  })

  it('sends Paystack the invoice number and nothing a person typed into the work order', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/abc' },
      })
    )

    await new PaystackProvider({ secretKey: 'sk_test_x' }).createCheckout({
      ...REQUEST,
      description: 'Payment for INV-1001 - <p>Brake <strong>service</strong></p>',
    })

    const raw = fetchMock.mock.calls[0][1].body as string
    expect(raw).not.toContain('<')
    expect(raw).not.toContain('Brake')
    expect(JSON.parse(raw).metadata.custom_fields).toEqual([
      { display_name: 'Invoice', variable_name: 'invoice', value: 'INV-1001' },
    ])
  })

  it('refuses in plain words when there is no email to give Paystack', async () => {
    await expect(
      new PaystackProvider({ secretKey: 'sk_test_x' }).createCheckout({
        ...REQUEST,
        payerEmail: null,
      })
    ).rejects.toThrow(/needs an email address/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains a refused currency in words a workshop can act on', async () => {
    fetchMock.mockResolvedValue(
      answer(400, {
        status: false,
        message: 'No active channel to process transaction. Please contact merchant',
      })
    )
    await expect(
      new PaystackProvider({ secretKey: 'sk_test_x' }).createCheckout({
        ...REQUEST,
        currency: 'nok',
      })
    ).rejects.toThrow(/cannot take payments in NOK.*workshop currency/)
  })

  it("passes on Paystack's own reason when it refuses, such as a currency the account cannot charge", async () => {
    fetchMock.mockResolvedValue(
      answer(400, { status: false, message: 'Currency not supported by merchant' })
    )
    await expect(
      new PaystackProvider({ secretKey: 'sk_test_x' }).createCheckout(REQUEST)
    ).rejects.toThrow('Paystack checkout failed: 400 Currency not supported by merchant')
  })
})

describe('checking a Paystack payment', () => {
  it('reports a successful transaction as paid, in the main unit, for the record it was started for', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        status: true,
        data: {
          status: 'success',
          amount: 125050,
          currency: 'ZAR',
          reference: 'inv-sr_1-1',
          metadata: { serviceRecordId: 'sr_1', orgId: 'org_1' },
        },
      })
    )

    const result = await new PaystackProvider({ secretKey: 'sk_test_x' }).verifyPayment(
      'inv-sr_1-1'
    )

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.paystack.co/transaction/verify/inv-sr_1-1')
    expect(result).toEqual({
      paid: true,
      amount: 1250.5,
      serviceRecordId: 'sr_1',
      organizationId: 'org_1',
    })
  })

  it.each([
    'abandoned',
    'failed',
    'ongoing',
    'pending',
  ])('does not count a transaction that is %s as paid', async (status) => {
    fetchMock.mockResolvedValue(
      answer(200, {
        status: true,
        data: { status, amount: 125050, metadata: { serviceRecordId: 'sr_1', orgId: 'org_1' } },
      })
    )
    const result = await new PaystackProvider({ secretKey: 'sk_test_x' }).verifyPayment('r')
    expect(result?.paid).toBe(false)
  })

  it('reads metadata that comes back as a JSON string', async () => {
    fetchMock.mockResolvedValue(
      answer(200, {
        status: true,
        data: {
          status: 'success',
          amount: 5000,
          metadata: JSON.stringify({ serviceRecordId: 'sr_9', orgId: 'org_9' }),
        },
      })
    )
    const result = await new PaystackProvider({ secretKey: 'sk_test_x' }).verifyPayment('r')
    expect(result).toMatchObject({ serviceRecordId: 'sr_9', organizationId: 'org_9' })
  })

  it('names nobody when the transaction carries no metadata, so it cannot be booked on an invoice', async () => {
    fetchMock.mockResolvedValue(
      answer(200, { status: true, data: { status: 'success', amount: 5000, metadata: '' } })
    )
    const result = await new PaystackProvider({ secretKey: 'sk_test_x' }).verifyPayment('r')
    expect(result).toMatchObject({ serviceRecordId: null, organizationId: null })
  })

  it('throws when Paystack cannot be asked, so a webhook can ask for a retry', async () => {
    const provider = new PaystackProvider({ secretKey: 'sk_test_x' })
    fetchMock.mockResolvedValue(answer(503, { status: false, message: 'Service unavailable' }))
    await expect(provider.lookup('r')).rejects.toThrow('Paystack verify failed: 503')
    fetchMock.mockResolvedValue(answer(429, { status: false, message: 'Too many requests' }))
    await expect(provider.lookup('r')).rejects.toThrow('429')
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(provider.lookup('r')).rejects.toThrow('fetch failed')
    // The invoice page's check stays quiet and lets the customer try again.
    await expect(provider.verifyPayment('r')).resolves.toBeNull()
  })

  it('answers nothing when Paystack does not know the reference', async () => {
    fetchMock.mockResolvedValue(answer(404, { status: false, message: 'Transaction not found' }))
    await expect(
      new PaystackProvider({ secretKey: 'sk_test_x' }).verifyPayment('nope')
    ).resolves.toBeNull()
  })
})

describe('checking a secret key', () => {
  it('accepts a key Paystack accepts', async () => {
    fetchMock.mockResolvedValue(answer(200, { status: true, data: [] }))
    await expect(
      new PaystackProvider({ secretKey: 'sk_test_x' }).checkKey()
    ).resolves.toBeUndefined()
  })

  it('says the key was rejected when Paystack answers 401', async () => {
    fetchMock.mockResolvedValue(answer(401, { status: false, message: 'Invalid key' }))
    await expect(new PaystackProvider({ secretKey: 'sk_test_bad' }).checkKey()).rejects.toThrow(
      'Paystack rejected the secret key'
    )
  })

  it('says so when the public key was pasted instead of the secret key', async () => {
    await expect(new PaystackProvider({ secretKey: 'pk_test_abc' }).checkKey()).rejects.toThrow(
      /That is the public key/
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('needs a key before anything is connected', () => {
    expect(paystackConfigFrom({ secretKey: '   ' })).toBeNull()
    expect(paystackConfigFrom({ secretKey: ' sk_live_x ' })).toEqual({ secretKey: 'sk_live_x' })
  })
})

describe('the signature on a Paystack notification', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'r' } })
  const signed = createHmac('sha512', 'sk_test_x').update(body).digest('hex')

  it('passes when the body was signed with the workshop key', () => {
    expect(paystackSignatureValid(body, signed, 'sk_test_x')).toBe(true)
  })

  it('fails for another key, a changed body, or no signature at all', () => {
    expect(paystackSignatureValid(body, signed, 'sk_test_other')).toBe(false)
    expect(paystackSignatureValid(`${body} `, signed, 'sk_test_x')).toBe(false)
    expect(paystackSignatureValid(body, null, 'sk_test_x')).toBe(false)
    expect(paystackSignatureValid(body, 'not-hex', 'sk_test_x')).toBe(false)
  })
})
