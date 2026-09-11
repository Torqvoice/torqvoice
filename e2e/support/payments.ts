import { expect, type Page } from '@playwright/test'
import { connectionStatus } from './db'
import { settle } from './hydration'

/**
 * Online payments, from both ends.
 *
 * The workshop connects a vendor in Settings → Integrations; the customer pays
 * from the shared invoice. Between them sits the stand-in vendor in
 * `e2e/payment-sink.ts`, whose state a spec reads to check what the customer
 * was actually charged.
 */

const sink = process.env.E2E_PAYMENT_SINK ?? 'http://127.0.0.1:8026'

export interface SinkStripeSession {
  id: string
  payment_status: 'unpaid' | 'paid'
  amount_total: number
  currency: string
  metadata: Record<string, string>
}

export interface SinkPayPalOrder {
  id: string
  status: string
  amount: { currency_code: string; value: string }
  custom_id: string
}

export interface SinkState {
  stripe: SinkStripeSession[]
  paypal: SinkPayPalOrder[]
  calls: string[]
}

/** Everything the stand-in vendor was asked for so far. */
export async function paymentSink(): Promise<SinkState> {
  const response = await fetch(`${sink}/state`)
  if (!response.ok) {
    throw new Error(`the payment sink answered ${response.status}. Is e2e/payment-sink.ts running?`)
  }
  return response.json()
}

export async function clearPaymentSink(): Promise<void> {
  await fetch(`${sink}/state`, { method: 'DELETE' })
}

/**
 * Types a vendor's keys into its connection page and presses Connect.
 *
 * The page tests the keys against the vendor before it stores anything as
 * live, so the outcome is read back as the connection's status rather than
 * from a toast: `active` when the vendor accepted them, anything else when not.
 */
export async function connectVendor(
  page: Page,
  vendor: 'stripe' | 'paypal',
  credentials: Record<string, string>
): Promise<void> {
  await page.goto(`/settings/integrations/${vendor}`)
  await settle(page)
  for (const [key, value] of Object.entries(credentials)) {
    const field = page.locator(`input[name="${vendor}-${key}"]`)
    await expect(field, `${vendor} asks for ${key}`).toBeVisible()
    await field.fill(value)
  }
  await page.getByRole('button', { name: 'Connect', exact: true }).click()
}

/** Waits for the connection to settle into the status a spec expects. */
export async function expectConnection(vendor: string, status: string): Promise<void> {
  await expect
    .poll(() => connectionStatus(vendor), { timeout: 30_000, message: `${vendor} is ${status}` })
    .toBe(status)
}
