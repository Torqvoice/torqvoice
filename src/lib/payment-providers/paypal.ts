import type { PaymentProvider, CheckoutRequest, CheckoutResult, VerifyResult } from './types'
import { paypalApiBase } from './vendor-hosts'

export interface PayPalConfig {
  clientId: string
  clientSecret: string
  useSandbox: boolean
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** The config a connection's credentials and settings amount to, or null without an id and secret. */
export function paypalConfigFrom(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PayPalConfig | null {
  const clientId = text(credentials.clientId)
  const clientSecret = text(credentials.clientSecret)
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret, useSandbox: settings.sandbox === true }
}

export class PayPalProvider implements PaymentProvider {
  private config: PayPalConfig
  private baseUrl: string

  constructor(config: PayPalConfig) {
    this.config = config
    this.baseUrl = paypalApiBase(config.useSandbox)
  }

  async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64'
    )

    const res = await fetch(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })

    if (!res.ok) {
      throw new Error(`PayPal auth failed: ${res.status}`)
    }

    const data = await res.json()
    return data.access_token
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const accessToken = await this.getAccessToken()

    const res = await fetch(`${this.baseUrl}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: {
              currency_code: req.currency,
              value: req.amount.toFixed(2),
            },
            description: req.description,
            invoice_id: req.invoiceNumber,
            custom_id: `${req.serviceRecordId}:${req.orgId}`,
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              // PayPal has no placeholder syntax; it appends its own
              // token (the order id) and PayerID to whatever is given. The
              // marker tells the invoice page which vendor it is back from.
              return_url: `${req.successUrl}?paypal=return`,
              cancel_url: req.cancelUrl,
              user_action: 'PAY_NOW',
              brand_name: req.description.split(' - ')[0] || 'Invoice Payment',
            },
          },
        },
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`PayPal order creation failed: ${res.status} ${errorText}`)
    }

    const data = await res.json()

    const approveLink = data.links?.find(
      (l: { rel: string; href: string }) => l.rel === 'payer-action'
    )

    if (!approveLink) {
      throw new Error('PayPal did not return a payer-action link')
    }

    return {
      redirectUrl: approveLink.href,
      externalId: data.id,
    }
  }

  async verifyPayment(orderId: string): Promise<VerifyResult | null> {
    try {
      const accessToken = await this.getAccessToken()

      const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (!res.ok) {
        // If already captured, try to get the order details instead
        if (res.status === 422) {
          return await this.getOrderDetails(orderId, accessToken)
        }
        return null
      }

      const data = await res.json()

      if (data.status === 'COMPLETED') {
        const amount = Number.parseFloat(
          data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value || '0'
        )
        return { paid: true, amount, ...paypalAttribution(data) }
      }

      return { paid: false, amount: 0, ...paypalAttribution(data) }
    } catch {
      return null
    }
  }

  private async getOrderDetails(
    orderId: string,
    accessToken: string
  ): Promise<VerifyResult | null> {
    const res = await fetch(`${this.baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) return null

    const data = await res.json()

    if (data.status === 'COMPLETED') {
      const amount = Number.parseFloat(
        data.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ||
          data.purchase_units?.[0]?.amount?.value ||
          '0'
      )
      return { paid: true, amount, ...paypalAttribution(data) }
    }

    return { paid: false, amount: 0, ...paypalAttribution(data) }
  }
}

/**
 * Who the order was created for, from the custom_id createCheckout wrote as
 * "serviceRecordId:orgId". A show-order response carries it on the purchase
 * unit; a capture response carries it on the capture.
 */
function paypalAttribution(data: {
  purchase_units?: Array<{
    custom_id?: unknown
    payments?: { captures?: Array<{ custom_id?: unknown }> }
  }>
}): { serviceRecordId: string | null; organizationId: string | null } {
  const unit = data.purchase_units?.[0]
  const raw = unit?.custom_id ?? unit?.payments?.captures?.[0]?.custom_id
  if (typeof raw !== 'string') return { serviceRecordId: null, organizationId: null }
  const [serviceRecordId, organizationId] = raw.split(':')
  return { serviceRecordId: serviceRecordId || null, organizationId: organizationId || null }
}
