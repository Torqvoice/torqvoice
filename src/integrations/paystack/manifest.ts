import { paymentManifest } from '../payments/build'

/**
 * Paystack checkout from the invoice link, into the workshop's own Paystack
 * account. Paystack only opens accounts for businesses in these countries.
 */
export const manifest = paymentManifest('paystack', {
  countries: ['NG', 'GH', 'ZA', 'KE', 'CI'],
  logo: '/images/integrations/paystack.svg',
})
