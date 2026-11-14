import { createHmac, timingSafeEqual } from 'node:crypto'
import type { CheckoutRequest, CheckoutResult, PaymentProvider, VerifyResult } from './types'
import { fromPaystackAmount, toPaystackAmount } from './vendor-amounts'
import { paystackApiBase } from './vendor-hosts'

export interface PaystackConfig {
  secretKey: string
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The config a connection's credentials amount to, or null without a secret key. */
export function paystackConfigFrom(credentials: Record<string, unknown>): PaystackConfig | null {
  const secretKey = text(credentials.secretKey)
  return secretKey ? { secretKey } : null
}

/** What Paystack said went wrong, in its own words when it gave any. */
async function paystackError(res: Response, what: string): Promise<Error> {
  let message = ''
  try {
    const body = (await res.json()) as { message?: unknown }
    message = text(body.message)
  } catch {
    // Not JSON; the status is all there is.
  }
  return new Error(`Paystack ${what} failed: ${res.status}${message ? ` ${message}` : ''}`)
}

export class PaystackProvider implements PaymentProvider {
  private config: PaystackConfig
  private baseUrl: string

  constructor(config: PaystackConfig) {
    this.config = config
    this.baseUrl = paystackApiBase()
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.secretKey}`,
      'Content-Type': 'application/json',
    }
  }

  /**
   * The cheapest call that proves a secret key: one row of the account's own
   * transactions. Paystack answers a bad key with 401.
   */
  async checkKey(): Promise<void> {
    // The dashboard shows the public key in the clear and the secret key
    // masked, so the public one is the easy one to copy by mistake.
    if (this.config.secretKey.startsWith('pk_')) {
      throw new Error(
        'That is the public key. Paystack needs the secret key, which starts with sk_test_ or sk_live_.'
      )
    }
    const res = await fetch(`${this.baseUrl}/transaction?perPage=1`, { headers: this.headers() })
    if (res.status === 401) throw new Error('Paystack rejected the secret key')
    if (!res.ok) throw await paystackError(res, 'key check')
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    // Paystack refuses a transaction without an email; the checkout route
    // falls back to the workshop's own when the customer has none.
    if (!req.payerEmail) {
      throw new Error(
        'Paystack needs an email address for the payer. Add one to the customer, or set the workshop email under Settings.'
      )
    }

    // Paystack allows only -, ., = and alphanumerics. The reference is just
    // a unique name; which invoice it pays for is carried in the metadata.
    const reference = `inv-${req.serviceRecordId.replace(/[^A-Za-z0-9.=-]/g, '')}-${Date.now()}`

    const res = await fetch(`${this.baseUrl}/transaction/initialize`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        email: req.payerEmail,
        amount: toPaystackAmount(req.amount),
        currency: req.currency.toUpperCase(),
        reference,
        // Paystack appends trxref and reference to whatever is given. The
        // marker tells the invoice page which vendor it is back from, since
        // Vipps comes back with a reference too.
        callback_url: `${req.successUrl}?paystack=return`,
        metadata: {
          serviceRecordId: req.serviceRecordId,
          orgId: req.orgId,
          invoiceNumber: req.invoiceNumber,
          // What the workshop sees on the transaction in its Paystack
          // dashboard. The invoice number only: titles and notes are written
          // in a rich text editor and are not sent anywhere.
          custom_fields: [
            { display_name: 'Invoice', variable_name: 'invoice', value: req.invoiceNumber },
          ],
          // Where the customer goes when they close the checkout unpaid.
          cancel_action: req.cancelUrl,
        },
      }),
    })

    if (!res.ok) {
      const error = await paystackError(res, 'checkout')
      // Paystack's answer when the account has no way to take this currency.
      // An account charges in its own country's currency, so this is almost
      // always the workshop currency not matching the Paystack account.
      if (/no active channel/i.test(error.message)) {
        throw new Error(
          `${error.message}. This Paystack account cannot take payments in ${req.currency.toUpperCase()}. A Paystack account charges in the currency of the country it was opened in, so the workshop currency under Settings, Localization must match it.`
        )
      }
      throw error
    }

    const body = (await res.json()) as {
      status?: boolean
      message?: string
      data?: { authorization_url?: string; reference?: string }
    }
    const url = body.data?.authorization_url
    if (!body.status || !url) {
      throw new Error(
        `Paystack did not return a checkout link${body.message ? `: ${body.message}` : ''}`
      )
    }

    return { redirectUrl: url, externalId: body.data?.reference || reference }
  }

  async verifyPayment(reference: string): Promise<VerifyResult | null> {
    try {
      return await this.lookup(reference)
    } catch {
      return null
    }
  }

  /**
   * What Paystack says about a transaction. Null when Paystack does not
   * know the reference, which is a final answer. Throws when Paystack could
   * not be asked (network, 429, 5xx), so a webhook can answer with an error
   * and get the notification again, instead of losing a paid charge.
   */
  async lookup(reference: string): Promise<VerifyResult | null> {
    const res = await fetch(`${this.baseUrl}/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: this.headers(),
    })
    if (res.status === 429 || res.status >= 500) throw await paystackError(res, 'verify')
    if (!res.ok) return null

    const body = (await res.json()) as { status?: boolean; data?: PaystackTransaction }
    const data = body.data
    if (!body.status || !data) return null

    return {
      paid: data.status === 'success',
      amount: fromPaystackAmount(typeof data.amount === 'number' ? data.amount : 0),
      ...paystackAttribution(data),
    }
  }
}

interface PaystackTransaction {
  status?: unknown
  amount?: unknown
  reference?: unknown
  metadata?: unknown
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Who a transaction was created for, from the metadata createCheckout sent.
 * Paystack hands metadata back as an object, or as a JSON string on some
 * responses, so both are read.
 */
export function paystackAttribution(data: PaystackTransaction): {
  serviceRecordId: string | null
  organizationId: string | null
} {
  let metadata: unknown = data.metadata
  if (typeof metadata === 'string') {
    try {
      metadata = JSON.parse(metadata)
    } catch {
      metadata = null
    }
  }
  const fields = (metadata && typeof metadata === 'object' ? metadata : {}) as {
    serviceRecordId?: unknown
    orgId?: unknown
  }
  return {
    serviceRecordId: textOrNull(fields.serviceRecordId),
    organizationId: textOrNull(fields.orgId),
  }
}

/**
 * Whether a notification was signed by the holder of this secret key.
 * Paystack signs the raw body with HMAC SHA512 and sends the hex digest in
 * `x-paystack-signature`.
 */
export function paystackSignatureValid(
  rawBody: string,
  signature: string | null,
  secretKey: string
): boolean {
  if (!signature || !secretKey) return false
  const expected = createHmac('sha512', secretKey).update(rawBody).digest()
  let given: Buffer
  try {
    given = Buffer.from(signature.trim(), 'hex')
  } catch {
    return false
  }
  return given.length === expected.length && timingSafeEqual(given, expected)
}
