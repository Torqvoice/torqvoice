import { paymentManifest } from '../payments/build'

/** PayPal checkout from the invoice link, through the workshop's own PayPal app. */
export const manifest = paymentManifest('paypal', {
  countries: 'global',
  logo: '/images/integrations/paypal.svg',
})
