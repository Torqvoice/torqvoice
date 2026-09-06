/**
 * Every payment vendor a customer can pay an invoice through, declared once.
 *
 * Stripe, Vipps and PayPal used to be three cards on the payment settings
 * page, each writing its own `AppSetting` rows and all switched on or off
 * through one `payment.providersEnabled` list. They are integrations like
 * any other, so they live in the catalog now. What must not change is that a
 * workshop which switched Vipps on last year keeps taking Vipps payments: the
 * `legacy` field on every credential and setting names the row the value
 * used to live in, so the platform can adopt an existing setup into a
 * connection without anyone touching a form.
 *
 * Unlike messaging, where one vendor per channel is in charge, payment
 * vendors run side by side: a Norwegian shop offers Vipps and card together.
 * Nothing here stands another vendor down.
 */

import type { CredentialField, SettingField } from '@/features/integrations/Lib/types'
import { SETTING_KEYS } from '@/features/settings/Schema/settingsSchema'

/** A credential field plus the settings row it used to be stored in. */
export interface PaymentCredential extends CredentialField {
  legacy: string
}

export interface PaymentSetting extends SettingField {
  legacy?: string
}

export interface PaymentVendor {
  /** Connector id, which is also the folder under src/integrations and the value in the old enabled list. */
  id: string
  /** Vendor name as the vendor writes it. */
  name: string
  credentials: PaymentCredential[]
  settings: PaymentSetting[]
  /**
   * Where the vendor must send its payment notifications, under the app URL.
   * The route is the same for every workshop; the vendor identifies the
   * workshop from the metadata the checkout was created with.
   */
  webhookPath: string
  /** i18n key under integrations.connection describing what to do with the URL. */
  webhookNote: 'inboundHintStripe' | 'inboundHintVipps' | 'inboundHintPaypal'
}

/** The value of `payment.providersEnabled` before the move, as a list. */
export const LEGACY_ENABLED_KEY = SETTING_KEYS.PAYMENT_PROVIDERS_ENABLED

/**
 * Whether a vendor is offered on the invoice link. The old page had a
 * switch per vendor, so a workshop could keep its keys and take a vendor off
 * the invoice for a while; this keeps that possible without disconnecting.
 */
export const OFFERED_SETTING: PaymentSetting = {
  key: 'enabled',
  type: 'boolean',
  label: 'enabled',
  help: 'enabledHelp',
  default: true,
}

export const PAYMENT_VENDORS: readonly PaymentVendor[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    credentials: [
      {
        key: 'secretKey',
        label: 'secretKey',
        type: 'password',
        required: true,
        placeholder: 'sk_live_...',
        help: 'secretKeyHelp',
        legacy: SETTING_KEYS.PAYMENT_STRIPE_SECRET_KEY,
      },
      {
        key: 'publishableKey',
        label: 'publishableKey',
        type: 'password',
        placeholder: 'pk_live_...',
        legacy: SETTING_KEYS.PAYMENT_STRIPE_PUBLISHABLE_KEY,
      },
      {
        key: 'webhookSecret',
        label: 'webhookSecret',
        type: 'password',
        placeholder: 'whsec_...',
        help: 'webhookSecretHelp',
        legacy: SETTING_KEYS.PAYMENT_STRIPE_WEBHOOK_SECRET,
      },
    ],
    settings: [OFFERED_SETTING],
    webhookPath: '/api/webhooks/stripe',
    webhookNote: 'inboundHintStripe',
  },
  {
    id: 'vipps',
    name: 'Vipps',
    credentials: [
      {
        key: 'clientId',
        label: 'clientId',
        type: 'password',
        required: true,
        legacy: SETTING_KEYS.PAYMENT_VIPPS_CLIENT_ID,
      },
      {
        key: 'clientSecret',
        label: 'clientSecret',
        type: 'password',
        required: true,
        legacy: SETTING_KEYS.PAYMENT_VIPPS_CLIENT_SECRET,
      },
      {
        key: 'subscriptionKey',
        label: 'subscriptionKey',
        type: 'password',
        required: true,
        help: 'subscriptionKeyHelp',
        legacy: SETTING_KEYS.PAYMENT_VIPPS_SUBSCRIPTION_KEY,
      },
      {
        key: 'merchantSerialNumber',
        label: 'merchantSerialNumber',
        type: 'text',
        required: true,
        placeholder: '123456',
        legacy: SETTING_KEYS.PAYMENT_VIPPS_MSN,
      },
    ],
    settings: [
      OFFERED_SETTING,
      {
        key: 'testMode',
        type: 'boolean',
        label: 'testMode',
        help: 'testModeHelp',
        default: false,
        legacy: SETTING_KEYS.PAYMENT_VIPPS_USE_TEST,
      },
    ],
    webhookPath: '/api/webhooks/vipps',
    webhookNote: 'inboundHintVipps',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    credentials: [
      {
        key: 'clientId',
        label: 'clientId',
        type: 'password',
        required: true,
        legacy: SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_ID,
      },
      {
        key: 'clientSecret',
        label: 'clientSecret',
        type: 'password',
        required: true,
        legacy: SETTING_KEYS.PAYMENT_PAYPAL_CLIENT_SECRET,
      },
    ],
    settings: [
      OFFERED_SETTING,
      {
        key: 'sandbox',
        type: 'boolean',
        label: 'sandbox',
        help: 'sandboxHelp',
        default: false,
        legacy: SETTING_KEYS.PAYMENT_PAYPAL_USE_SANDBOX,
      },
    ],
    webhookPath: '/api/webhooks/paypal',
    webhookNote: 'inboundHintPaypal',
  },
]

export const PAYMENT_CONNECTOR_IDS = PAYMENT_VENDORS.map((v) => v.id)

export function paymentVendor(connectorId: string): PaymentVendor | null {
  return PAYMENT_VENDORS.find((v) => v.id === connectorId) ?? null
}

export function isPaymentConnector(connectorId: string): boolean {
  return PAYMENT_VENDORS.some((v) => v.id === connectorId)
}

/** Every old row the payment vendors were stored under, plus the enabled list. */
export function legacyPaymentKeys(): string[] {
  const keys = new Set<string>([LEGACY_ENABLED_KEY])
  for (const vendor of PAYMENT_VENDORS) {
    for (const c of vendor.credentials) keys.add(c.legacy)
    for (const s of vendor.settings) if (s.legacy) keys.add(s.legacy)
  }
  return [...keys]
}
