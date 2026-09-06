/**
 * Which connections a customer can pay an invoice through.
 *
 * Stripe, Vipps and PayPal used to be three cards on the payment settings
 * page, their keys in `AppSetting` rows and the ones switched on listed in
 * `payment.providersEnabled`. They are integrations like any other, so they
 * moved into the catalog: keys sealed on an `IntegrationConnection`, test
 * mode a setting on it. What must not change is that a workshop which
 * switched Vipps on last year keeps taking Vipps payments without touching
 * anything. The first time a payment path runs, or the catalog is opened,
 * every vendor the old list had switched on is adopted into an active
 * connection, once, and used from then on. Nothing is asked of the workshop
 * and nothing is deleted, so a rollback still finds the old rows where it
 * left them.
 *
 * Unlike messaging, vendors here run side by side. Adoption takes all of
 * them at once and nothing stands another vendor down.
 */

import {
  LEGACY_ENABLED_KEY,
  PAYMENT_CONNECTOR_IDS,
  PAYMENT_VENDORS,
  type PaymentVendor,
  isPaymentConnector,
  legacyPaymentKeys,
  paymentVendor,
} from '@/integrations/payments/catalog'
import { db } from '@/lib/db'
import { type PaymentProvider, buildPaymentProvider } from '@/lib/payment-providers'
import { openCredentials, sealCredentials } from './vault'

export { PAYMENT_CONNECTOR_IDS, isPaymentConnector }

/**
 * Row that records the move having happened, so it happens once.
 *
 * Without it, disconnecting an adopted vendor would be undone by the next
 * checkout, which would read the old rows and adopt them all over again.
 * One row covers all three vendors, since the old page switched them on
 * through one list. The row is one more setting the old code never read, so
 * a rollback ignores it.
 */
export const PAYMENTS_ADOPTED_KEY = 'integrations.payments.adoptedAt'

export interface PaymentSetup {
  connectionId: string
  connectorId: string
  vendor: PaymentVendor
  credentials: Record<string, unknown>
  settings: Record<string, unknown>
}

/** Manifest defaults under what the workshop saved, the way the settings form shows them. */
function withDefaults(
  vendor: PaymentVendor,
  saved: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const field of vendor.settings) {
    if (field.default !== undefined) out[field.key] = field.default
  }
  return { ...out, ...saved }
}

/** Whether the workshop offers this vendor on the invoice link right now. */
export function isOffered(setup: Pick<PaymentSetup, 'settings'>): boolean {
  return setup.settings.enabled !== false
}

/** Vendors in the order the invoice link shows them, whatever order the rows came in. */
function inVendorOrder<T extends { connectorId: string }>(setups: T[]): T[] {
  const rank = new Map(PAYMENT_VENDORS.map((v, i) => [v.id, i]))
  return [...setups].sort(
    (a, b) => (rank.get(a.connectorId) ?? 99) - (rank.get(b.connectorId) ?? 99)
  )
}

/** Record that the connections table decides online payments from now on. */
export async function markPaymentsAdopted(organizationId: string, userId: string): Promise<void> {
  await db.appSetting.upsert({
    where: { organizationId_key: { organizationId, key: PAYMENTS_ADOPTED_KEY } },
    create: { organizationId, userId, key: PAYMENTS_ADOPTED_KEY, value: new Date().toISOString() },
    update: {},
  })
}

export interface LegacyPaymentSetup {
  vendor: PaymentVendor
  credentials: Record<string, string>
  settings: Record<string, unknown>
  userId: string | null
}

/**
 * The vendors an organization had switched on before the move, read without
 * writing anything.
 *
 * A vendor counts only if the old list named it and every credential it
 * requires is filled in: a card the workshop switched on and never finished
 * is left alone rather than adopted into a connection that cannot take a
 * payment. A vendor with keys but switched off is left alone too; that is
 * what the switch meant.
 */
export async function legacyPaymentSetups(
  organizationId: string
): Promise<{ setups: LegacyPaymentSetup[]; adopted: boolean }> {
  const rows = await db.appSetting.findMany({
    where: { organizationId, key: { in: [...legacyPaymentKeys(), PAYMENTS_ADOPTED_KEY] } },
    select: { key: true, value: true, userId: true },
  })
  const values = new Map(rows.map((r) => [r.key, r.value]))
  const adopted = values.has(PAYMENTS_ADOPTED_KEY)
  const userId = rows.find((r) => r.userId)?.userId ?? null

  const enabled = new Set(
    (values.get(LEGACY_ENABLED_KEY) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  const setups: LegacyPaymentSetup[] = []
  for (const vendor of PAYMENT_VENDORS) {
    if (!enabled.has(vendor.id)) continue

    const credentials: Record<string, string> = {}
    for (const field of vendor.credentials) {
      const value = values.get(field.legacy)?.trim()
      if (value) credentials[field.key] = value
    }
    if (vendor.credentials.some((f) => f.required && !credentials[f.key])) continue

    const settings: Record<string, unknown> = {}
    for (const field of vendor.settings) {
      const raw = field.legacy ? values.get(field.legacy) : undefined
      // An empty boolean row is no answer; the catalog default applies, the
      // way the old checkout treated a missing row.
      if (raw === undefined || (field.type === 'boolean' && raw === '')) continue
      settings[field.key] = field.type === 'boolean' ? raw === 'true' : raw
    }

    setups.push({ vendor, credentials, settings, userId })
  }
  return { setups, adopted }
}

/** Prisma's code for a unique constraint the row already satisfies. */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
}

/** What the connection page shows as the account, for a setup that never went through identify. */
function accountNameOf(setup: LegacyPaymentSetup): string | null {
  const msn = setup.credentials.merchantSerialNumber
  return msn ? `MSN ${msn}` : null
}

/**
 * Turn the old setup into live connections. Runs once per organization: the
 * marker is written whether or not every row survives, and a vendor row the
 * workshop put there themselves is never written over.
 */
export async function adoptLegacyPayments(organizationId: string): Promise<PaymentSetup[]> {
  const { setups, adopted } = await legacyPaymentSetups(organizationId)
  // Adopted once already: whatever happened to those connections since, such
  // as the workshop disconnecting one, is the current truth.
  if (adopted || setups.length === 0) return []

  const live: PaymentSetup[] = []
  for (const setup of setups) {
    const { vendor } = setup
    // A row for this vendor that the workshop created themselves stays
    // theirs, even in error: the old rows are not copied over it.
    const existing = await db.integrationConnection.findUnique({
      where: { organizationId_connectorId: { organizationId, connectorId: vendor.id } },
      select: { id: true },
    })
    if (existing) continue

    let connection: { id: string; status: string }
    try {
      connection = await db.integrationConnection.create({
        data: {
          organizationId,
          connectorId: vendor.id,
          status: 'active',
          credentials: sealCredentials(setup.credentials),
          settings: setup.settings as object,
          createdById: setup.userId ?? 'migration',
          label: 'Adopted from settings',
          externalAccountName: accountNameOf(setup),
        },
        select: { id: true, status: true },
      })
    } catch (err) {
      // Two checkouts can land here at once on the first payment after a
      // deploy. The loser of that race uses the winner's row.
      if (!isUniqueViolation(err)) throw err
      const winner = await db.integrationConnection.findUnique({
        where: { organizationId_connectorId: { organizationId, connectorId: vendor.id } },
        select: { id: true, status: true },
      })
      if (!winner) throw err
      connection = winner
    }

    if (connection.status === 'active') {
      live.push({
        connectionId: connection.id,
        connectorId: vendor.id,
        vendor,
        credentials: setup.credentials,
        settings: withDefaults(vendor, setup.settings),
      })
    }
  }

  // Every old row carries the user who wrote it, so there is always one to
  // own the marker.
  const owner = setups.find((s) => s.userId)?.userId
  if (owner) await markPaymentsAdopted(organizationId, owner)

  return inVendorOrder(live)
}

/**
 * Last resort when a connection's credentials cannot be opened: the old rows
 * are still there, so the vendor keeps taking payments from them while
 * someone sorts the key out. Logged every time, because it should never be
 * quiet.
 */
async function unsealedFallback(
  organizationId: string,
  connectorId: string,
  connectionId: string,
  err: unknown
): Promise<PaymentSetup | null> {
  console.error(
    `[integrations] cannot open credentials for ${connectorId} connection ${connectionId} of organization ${organizationId}; ` +
      'check INTEGRATIONS_ENCRYPTION_KEY / BETTER_AUTH_SECRET (see scripts/rekey-integrations.ts). ' +
      'Falling back to the settings rows from before the move.',
    err
  )
  const { setups } = await legacyPaymentSetups(organizationId)
  const setup = setups.find((s) => s.vendor.id === connectorId)
  if (!setup) return null
  return {
    connectionId,
    connectorId,
    vendor: setup.vendor,
    credentials: setup.credentials,
    settings: withDefaults(setup.vendor, setup.settings),
  }
}

/**
 * The connections a customer can pay through, adopting an old setup on first
 * use. Includes vendors the workshop has paused with the offered switch;
 * callers that put buttons on a page filter with `isOffered`, while the
 * paths that record money already paid do not.
 */
export async function paymentSetups(organizationId: string): Promise<PaymentSetup[]> {
  const rows = await db.integrationConnection.findMany({
    where: { organizationId, connectorId: { in: [...PAYMENT_CONNECTOR_IDS] }, status: 'active' },
    select: { id: true, connectorId: true, credentials: true, settings: true },
  })
  if (rows.length === 0) return adoptLegacyPayments(organizationId)

  const setups: PaymentSetup[] = []
  for (const row of rows) {
    const vendor = paymentVendor(row.connectorId)
    if (!vendor) continue
    let credentials: Record<string, unknown>
    try {
      credentials = openCredentials(row.credentials)
    } catch (err) {
      const fallback = await unsealedFallback(organizationId, row.connectorId, row.id, err)
      if (fallback) setups.push(fallback)
      continue
    }
    setups.push({
      connectionId: row.id,
      connectorId: row.connectorId,
      vendor,
      credentials,
      settings: withDefaults(vendor, (row.settings as Record<string, unknown>) ?? {}),
    })
  }
  return inVendorOrder(setups)
}

/** One vendor's connection, with the client that talks to it. Null when the workshop has not connected it. */
export async function paymentProviderFor(
  organizationId: string,
  connectorId: string
): Promise<{ setup: PaymentSetup; provider: PaymentProvider } | null> {
  const setup = (await paymentSetups(organizationId)).find((s) => s.connectorId === connectorId)
  if (!setup) return null
  const provider = buildPaymentProvider(connectorId, setup.credentials, setup.settings)
  return provider ? { setup, provider } : null
}

/**
 * Which vendors the invoice link should offer, without adopting anything.
 *
 * The shared invoice page calls this on every view, and a page render is no
 * place to create a connection; the adoption happens when a customer
 * actually pays, or when the catalog is opened. Until then an old setup is
 * read as it stands, so the buttons are there on the first view after the
 * deploy as they were on the last one before it.
 */
export async function offeredPaymentProviders(organizationId: string): Promise<string[]> {
  const rows = await db.integrationConnection.findMany({
    where: { organizationId, connectorId: { in: [...PAYMENT_CONNECTOR_IDS] }, status: 'active' },
    select: { connectorId: true, settings: true },
  })
  if (rows.length > 0) {
    return inVendorOrder(rows)
      .filter((row) => isOffered({ settings: (row.settings as Record<string, unknown>) ?? {} }))
      .map((row) => row.connectorId)
  }
  const { setups, adopted } = await legacyPaymentSetups(organizationId)
  if (adopted) return []
  return setups.filter((s) => isOffered(s)).map((s) => s.vendor.id)
}

export interface PaymentWebhook {
  url: string
  /** What the vendor also needs beside the URL, as an i18n key under connection. */
  note: PaymentVendor['webhookNote']
}

/**
 * The URL a payment vendor must notify when a customer has paid. The same
 * route serves every workshop, because the vendor sends back the metadata
 * the checkout was created with, so there is no secret in it to keep.
 */
export function paymentWebhook(connectorId: string, appUrl: string): PaymentWebhook | null {
  const vendor = paymentVendor(connectorId)
  if (!vendor || !appUrl) return null
  return { url: `${appUrl.replace(/\/$/, '')}${vendor.webhookPath}`, note: vendor.webhookNote }
}
