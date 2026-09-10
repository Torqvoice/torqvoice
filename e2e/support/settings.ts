import { expect, type Page } from '@playwright/test'
import { fillSettled } from './hydration'

/**
 * The workshop settings a spec has to move before it can assert anything: tax,
 * and the rules that decide an invoice number.
 *
 * These are one workshop's settings, shared by every test in the run, so a
 * spec that changes one puts it back at the end. Both pages are controlled
 * React forms, which is why the fields are typed into through `fillSettled`
 * rather than `fill`.
 */

export interface TaxSetup {
  enabled: boolean
  rate?: number
  inclusive?: boolean
  label?: string
}

/** Settings → Tax, saved. */
export async function setTax(page: Page, tax: TaxSetup): Promise<void> {
  await page.goto('/settings/tax')
  const enable = page.getByRole('switch').first()
  await expect(enable).toBeVisible()
  const on = (await enable.getAttribute('aria-checked')) === 'true'
  if (on !== tax.enabled) await enable.click()
  if (tax.enabled) {
    await page.locator('#defaultTaxRate').fill(String(tax.rate ?? 0))
    await page.locator('#taxLabel').fill(tax.label ?? '')
    await page
      .getByRole('button', { name: tax.inclusive ? 'Inclusive' : 'Exclusive', exact: true })
      .click()
  }
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click()
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()
}

export interface NumberingSetup {
  /** The invoice number format, `{year}` and `{month}` included. */
  prefix: string
  /** The number the next invoice takes. Empty leaves the sequence alone. */
  startNumber?: string
}

/** Settings → Invoice, the numbering half of it, saved. */
export async function setInvoiceNumbering(
  page: Page,
  { prefix, startNumber = '' }: NumberingSetup
): Promise<void> {
  await page.goto('/settings/invoice')
  await fillSettled(page.locator('#invoicePrefix'), prefix)
  await fillSettled(page.locator('#invoiceStartNumber'), startNumber)
  await page.getByRole('button', { name: 'Save Invoice Settings', exact: true }).click()
  await expect(page.getByText('Invoice settings saved', { exact: true })).toBeVisible()
}

/** What the settings page currently offers as the next invoice number. */
export async function invoiceStartNumber(page: Page): Promise<string> {
  await page.goto('/settings/invoice')
  const field = page.locator('#invoiceStartNumber')
  await expect(field).toBeVisible()
  return field.inputValue()
}
