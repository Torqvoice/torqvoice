import type { PaymentProvider } from './types'
import { StripeProvider } from './stripe'
import { VippsProvider, vippsConfigFrom } from './vipps'
import { PayPalProvider, paypalConfigFrom } from './paypal'

export type { PaymentProvider, CheckoutRequest, CheckoutResult, VerifyResult } from './types'

/**
 * The client for one payment connection, from the credentials and settings
 * the connection holds. Null when the connection is missing something the
 * vendor cannot work without, which the caller reports as "not configured"
 * rather than letting a half-built client fail somewhere deeper.
 */
export function buildPaymentProvider(
  connectorId: string,
  credentials: Record<string, unknown>,
  settings: Record<string, unknown>
): PaymentProvider | null {
  switch (connectorId) {
    case 'stripe': {
      const secretKey = credentials.secretKey
      if (typeof secretKey !== 'string' || !secretKey.trim()) return null
      return new StripeProvider(secretKey.trim())
    }
    case 'vipps': {
      const config = vippsConfigFrom(credentials, settings)
      return config ? new VippsProvider(config) : null
    }
    case 'paypal': {
      const config = paypalConfigFrom(credentials, settings)
      return config ? new PayPalProvider(config) : null
    }
    default:
      return null
  }
}
