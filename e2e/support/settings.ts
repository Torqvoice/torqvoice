import { expect, type Page } from '@playwright/test'
import { fillSettled, settle } from './hydration'

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

/**
 * Settings → Localisation: the workshop's clock.
 *
 * The timezone decides what a booking's wall clock means, and the format
 * decides how it is written. Both are set together because a test that reads
 * a time off one screen and looks for it on another needs them to agree: the
 * calendar prints the workshop's chosen format, while a schedule field prints
 * a 24-hour clock whatever the setting says.
 *
 * Pass an empty timezone to hand it back to the browser's own, which is what
 * a workshop that has never chosen sees.
 */
export async function setWorkshopClock(
  page: Page,
  { timezone, format }: { timezone: string; format?: '12h' | '24h' }
): Promise<void> {
  await page.goto('/settings/localization')
  await settle(page)

  // By label, not by what it currently reads: the date-format select a few
  // rows up also shows a value full of slashes.
  const picker = page.getByLabel('Timezone')
  await expect(async () => {
    await picker.click()
    await expect(page.getByPlaceholder('Search timezone...')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  if (timezone) {
    // The list is long, so it is narrowed to the city, written the way the
    // list writes it: "Los Angeles", not "Los_Angeles".
    const city = (timezone.split('/').pop() ?? timezone).replace(/_/g, ' ')
    await page.getByPlaceholder('Search timezone...').fill(city)
    await page
      .getByRole('option', { name: timezone.replace(/_/g, ' '), exact: true })
      .first()
      .click()
  } else {
    await page.getByRole('option', { name: 'Auto-detect (browser)' }).first().click()
  }

  if (format) {
    const wanted = format === '24h' ? '24-hour (14:30)' : '12-hour (2:30 PM)'
    const clock = page.getByLabel('Time Format')
    await expect(async () => {
      await clock.click()
      await expect(page.getByRole('option', { name: wanted })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('option', { name: wanted }).click()
  }

  await page.getByRole('button', { name: 'Save Settings', exact: true }).click()
  await expect(page.getByText('Localization settings saved')).toBeVisible({ timeout: 30_000 })
}
