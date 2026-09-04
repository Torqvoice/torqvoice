import { paymentManifest } from '../payments/build'

/**
 * Vipps MobilePay from the invoice link. The wallet the Nordic countries pay
 * with, so it is featured there and available everywhere.
 */
export const manifest = paymentManifest('vipps', {
  countries: ['NO', 'DK', 'FI', 'SE'],
  logo: '/images/integrations/vipps.svg',
})
