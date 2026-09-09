import type { PaymentProvider, CheckoutRequest, CheckoutResult, VerifyResult } from './types'

const VIPPS_API_URL = 'https://api.vipps.no'
const VIPPS_TEST_API_URL = 'https://apitest.vipps.no'

export interface VippsConfig {
  clientId: string
  clientSecret: string
  subscriptionKey: string
  merchantSerialNumber: string
  useTestMode: boolean
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * The config a connection's credentials and settings amount to, or null when
 * any of the four values Vipps insists on is missing.
 */
export function vippsConfigFrom(
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): VippsConfig | null {
  const clientId = text(credentials.clientId)
  const clientSecret = text(credentials.clientSecret)
  const subscriptionKey = text(credentials.subscriptionKey)
  const merchantSerialNumber = text(credentials.merchantSerialNumber)
  if (!clientId || !clientSecret || !subscriptionKey || !merchantSerialNumber) return null
  return {
    clientId,
    clientSecret,
    subscriptionKey,
    merchantSerialNumber,
    useTestMode: settings.testMode === true,
  }
}

export class VippsProvider implements PaymentProvider {
  private config: VippsConfig
  private baseUrl: string

  constructor(config: VippsConfig) {
    this.config = config
    this.baseUrl = config.useTestMode ? VIPPS_TEST_API_URL : VIPPS_API_URL
  }

  async getAccessToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/accesstoken/get`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        'Merchant-Serial-Number': this.config.merchantSerialNumber,
      },
    })

    if (!res.ok) {
      throw new Error(`Vipps auth failed: ${res.status}`)
    }

    const data = await res.json()
    return data.access_token
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const accessToken = await this.getAccessToken()
    const reference = `inv-${req.serviceRecordId}-${Date.now()}`

    const res = await fetch(`${this.baseUrl}/epayment/v1/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
        'Merchant-Serial-Number': this.config.merchantSerialNumber,
        'Idempotency-Key': reference,
      },
      body: JSON.stringify({
        amount: {
          currency: req.currency,
          value: Math.round(req.amount * 100),
        },
        paymentMethod: { type: 'WALLET' },
        reference,
        paymentDescription: `Invoice ${req.invoiceNumber}`,
        userFlow: 'WEB_REDIRECT',
        returnUrl: `${req.successUrl}?reference=${reference}`,
        metadata: {
          serviceRecordId: req.serviceRecordId,
          orgId: req.orgId,
        },
      }),
    })

    if (!res.ok) {
      const errorText = await res.text()
      throw new Error(`Vipps payment creation failed: ${res.status} ${errorText}`)
    }

    const data = await res.json()

    return {
      redirectUrl: data.redirectUrl,
      externalId: reference,
    }
  }

  async verifyPayment(externalId: string): Promise<VerifyResult | null> {
    try {
      const accessToken = await this.getAccessToken()

      const res = await fetch(`${this.baseUrl}/epayment/v1/payments/${externalId}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Ocp-Apim-Subscription-Key': this.config.subscriptionKey,
          'Merchant-Serial-Number': this.config.merchantSerialNumber,
        },
      })

      if (!res.ok) return null

      const data = await res.json()
      const paid = data.state === 'AUTHORIZED' || data.state === 'CAPTURED'

      return {
        paid,
        amount: (data.amount?.value ?? 0) / 100,
        ...vippsAttribution(data),
      }
    } catch {
      return null
    }
  }
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Who a payment was created for. Vipps passes the metadata from
 * createCheckout through untouched, and the reference we minted carries the
 * record id as well, which covers a payment made before metadata was sent.
 */
function vippsAttribution(data: {
  metadata?: { serviceRecordId?: unknown; orgId?: unknown }
  reference?: unknown
}): { serviceRecordId: string | null; organizationId: string | null } {
  const reference = textOrNull(data.reference)
  const fromReference = reference?.match(/^inv-(.+)-\d+$/)?.[1] ?? null
  return {
    serviceRecordId: textOrNull(data.metadata?.serviceRecordId) ?? fromReference,
    organizationId: textOrNull(data.metadata?.orgId),
  }
}
