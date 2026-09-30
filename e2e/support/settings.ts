import { expect, type Locator, type Page } from '@playwright/test'
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

export interface TaxComponentSetup {
  name: string
  rate: number
  registrationNumber?: string
}

export interface TaxSetup {
  enabled: boolean
  rate?: number
  inclusive?: boolean
  label?: string
  /**
   * More than one tax on a document (Québec's GST and QST). Given, the split
   * switch is turned on and these rows replace the single rate; left out, the
   * switch is turned off and the workshop is back to one rate.
   */
  components?: TaxComponentSetup[]
}

/** Flips a switch to the wanted state, retried because a click before hydration does nothing. */
async function setSwitch(toggle: Locator, on: boolean): Promise<void> {
  await expect(toggle).toBeVisible()
  await expect(async () => {
    if ((await toggle.getAttribute('aria-checked')) === String(on)) return
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', String(on))
  }).toPass()
}

/** Settings → Tax, saved. */
export async function setTax(page: Page, tax: TaxSetup): Promise<void> {
  await page.goto('/settings/tax')
  await setSwitch(page.getByRole('switch').first(), tax.enabled)
  if (tax.enabled) {
    await setSwitch(page.locator('#taxSplit'), Boolean(tax.components))
    if (tax.components) {
      const rows = page.getByTestId('tax-component-row')
      while ((await rows.count()) > tax.components.length) {
        await rows.last().getByRole('button', { name: 'Remove this tax' }).click()
      }
      while ((await rows.count()) < tax.components.length) {
        await page.getByRole('button', { name: 'Add a tax' }).click()
      }
      for (const [i, component] of tax.components.entries()) {
        await fillSettled(page.locator(`#taxComponentName-${i}`), component.name)
        await fillSettled(page.locator(`#taxComponentRate-${i}`), String(component.rate))
        await fillSettled(
          page.locator(`#taxComponentRegistration-${i}`),
          component.registrationNumber ?? ''
        )
      }
    } else {
      await page.locator('#defaultTaxRate').fill(String(tax.rate ?? 0))
      await page.locator('#taxLabel').fill(tax.label ?? '')
    }
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

export interface QuoteLockSetup {
  enabled: boolean
  /** When a quote stops being editable: once it goes to the customer, or once they accept. */
  trigger: 'sent' | 'accepted'
}

/**
 * Settings → Invoice, the quote half of "Locking finished documents", saved.
 * Off by default, so a spec that turns it on turns it off again.
 */
export async function setQuoteLock(
  page: Page,
  { enabled, trigger }: QuoteLockSetup
): Promise<void> {
  await page.goto('/settings/invoice')
  await settle(page)

  // The trigger select is disabled while the switch is off, so the switch goes
  // on first and is set to what was asked for after the trigger is chosen.
  const toggle = page.locator('#quoteLockEnabled')
  await setSwitch(toggle, true)

  const wanted = trigger === 'sent' ? 'Once the quote is sent' : 'Once the quote is accepted'
  const select = page.locator('#quoteLockTrigger')
  await expect(async () => {
    await select.click()
    await expect(page.getByRole('option', { name: wanted })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('option', { name: wanted }).click()
  await expect(select).toContainText(wanted)

  await setSwitch(toggle, enabled)
  await page.getByRole('button', { name: 'Save Invoice Settings', exact: true }).click()
  await expect(page.getByText('Invoice settings saved', { exact: true })).toBeVisible()
}

export interface InvoiceLockSetup {
  enabled: boolean
  trigger: 'sent' | 'paid'
}

/**
 * Settings → Invoice, the invoice half of "Locking finished documents", saved.
 * Off by default, so a spec that turns it on turns it off again. Invoices sent
 * before it was turned on stay editable, so a spec sends its job afterwards.
 */
export async function setInvoiceLock(
  page: Page,
  { enabled, trigger }: InvoiceLockSetup
): Promise<void> {
  await page.goto('/settings/invoice')
  await settle(page)

  // As with the quote lock: the trigger is disabled while the switch is off.
  const toggle = page.locator('#invoiceLockEnabled')
  await setSwitch(toggle, true)

  const wanted =
    trigger === 'sent' ? 'Once the invoice is sent' : 'Once the invoice is paid in full'
  const select = page.locator('#invoiceLockTrigger')
  await expect(async () => {
    await select.click()
    await expect(page.getByRole('option', { name: wanted })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('option', { name: wanted }).click()
  await expect(select).toContainText(wanted)

  await setSwitch(toggle, enabled)
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

/**
 * Settings → Payment, the bank account.
 *
 * The payment panel on a sheet prints nothing at all unless it has a line to
 * print, and the seeded workshop has no bank details, no org number and no
 * terms. A spec that wants the panel has to give it one, and put it back
 * afterwards: every other sheet in the suite is printed from these settings.
 */
export async function setBankAccount(page: Page, account: string): Promise<void> {
  await page.goto('/settings/payment')
  await fillSettled(page.locator('#bankAccount'), account)
  await page.getByRole('button', { name: 'Save Payment Settings', exact: true }).click()
  await expect(page.getByText('Payment settings saved', { exact: true })).toBeVisible()
}

/** What the workshop currently has as its bank account, which may be nothing. */
export async function bankAccount(page: Page): Promise<string> {
  await page.goto('/settings/payment')
  const field = page.locator('#bankAccount')
  await expect(field).toBeVisible()
  return field.inputValue()
}

export interface WarrantySetup {
  /** What a new quote or work order says before anybody touches it. */
  newDocumentsSay: 'Nothing' | 'Warranty included' | 'No warranty'
  months?: number
  distance?: number
  terms?: string
  notIncludedText?: string
  /** Whether the defaults reach new quotes, and new work orders. On unless said otherwise. */
  onQuotes?: boolean
  onWorkOrders?: boolean
}

/**
 * Settings → Warranty, saved. Nothing is set on a seeded workshop, so a spec
 * that writes these removes them afterwards (`forgetWorkshopSetting`): every
 * other quote and invoice in the suite is printed without a warranty panel.
 */
export async function setWarrantyDefaults(page: Page, warranty: WarrantySetup): Promise<void> {
  await page.goto('/settings/warranty')
  await settle(page)

  const choice = page.getByRole('radio', { name: warranty.newDocumentsSay, exact: true })
  await expect(async () => {
    await choice.click()
    await expect(choice).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  const text = (value: number | string | undefined) => (value === undefined ? '' : String(value))
  await fillSettled(page.locator('#warrantyDefaultMonths'), text(warranty.months))
  await fillSettled(page.locator('#warrantyDefaultMileage'), text(warranty.distance))
  await fillSettled(page.locator('#warrantyDefaultTerms'), text(warranty.terms))
  await fillSettled(page.locator('#warrantyNotIncludedText'), text(warranty.notIncludedText))
  await setSwitch(page.locator('#warrantyApplyToQuotes'), warranty.onQuotes ?? true)
  await setSwitch(page.locator('#warrantyApplyToWorkOrders'), warranty.onWorkOrders ?? true)

  await page.getByRole('button', { name: 'Save warranty settings', exact: true }).click()
  await expect(page.getByText('Warranty settings saved', { exact: true })).toBeVisible()
}
