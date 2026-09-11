import type Stripe from 'stripe'
import { stripeClient } from './vendor-hosts'
import type { PaymentProvider, CheckoutRequest, CheckoutResult, VerifyResult } from './types'

export class StripeProvider implements PaymentProvider {
  private stripe: Stripe

  constructor(secretKey: string) {
    this.stripe = stripeClient(secretKey)
  }

  async createCheckout(req: CheckoutRequest): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: req.currency.toLowerCase(),
            unit_amount: Math.round(req.amount * 100),
            product_data: {
              name: `Invoice ${req.invoiceNumber}`,
              description: req.description,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        serviceRecordId: req.serviceRecordId,
        orgId: req.orgId,
        invoiceNumber: req.invoiceNumber,
      },
      success_url: `${req.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: req.cancelUrl,
    })

    if (!session.url) {
      throw new Error('Failed to create Stripe checkout session')
    }

    return {
      redirectUrl: session.url,
      externalId: session.id,
    }
  }

  async verifyPayment(externalId: string): Promise<VerifyResult | null> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(externalId)
      return {
        paid: session.payment_status === 'paid',
        amount: (session.amount_total ?? 0) / 100,
        serviceRecordId: session.metadata?.serviceRecordId ?? null,
        organizationId: session.metadata?.orgId ?? null,
      }
    } catch {
      return null
    }
  }
}
