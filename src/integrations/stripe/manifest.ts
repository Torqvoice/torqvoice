import { paymentManifest } from '../payments/build'

/**
 * Card payments from the invoice link, through the workshop's own Stripe
 * account. Not the platform's Stripe, which bills subscriptions and lives in
 * system settings; this is the account the customer's money lands in.
 */
export const manifest = paymentManifest('stripe', {
  countries: 'global',
  logo: '/images/integrations/stripe.svg',
})
