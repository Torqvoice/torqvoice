import type {
  ConnectorManifest,
  CredentialField,
  SettingField,
} from '@/features/integrations/Lib/types'
import { type PaymentVendor, paymentVendor } from './catalog'

/** The one thing a payment connector does: let a customer pay from the invoice link. */
export const PAYMENT_CAPABILITY = 'payments.checkout'

function withoutLegacy<T extends { legacy?: string }>(field: T): Omit<T, 'legacy'> {
  const { legacy: _legacy, ...rest } = field
  return rest
}

/**
 * A payment vendor's manifest, built from the catalog entry so the fields
 * the connect page shows and the rows adoption reads are the same list.
 */
export function paymentManifest(
  id: string,
  extras: Pick<ConnectorManifest, 'countries' | 'logo'>
): ConnectorManifest {
  const vendor = paymentVendor(id)
  if (!vendor) throw new Error(`Unknown payment vendor ${id}`)
  return {
    id: vendor.id,
    name: vendor.name,
    category: 'payments',
    countries: extras.countries,
    logo: extras.logo,
    docs: '/docs/configuration/payment-providers',
    auth: {
      type: 'api-key',
      fields: vendor.credentials.map((c) => withoutLegacy(c) as CredentialField),
    },
    capabilities: [PAYMENT_CAPABILITY],
    settings: vendor.settings.map((s) => withoutLegacy(s) as SettingField),
    plan: 'payments',
  }
}

export type { PaymentVendor }
