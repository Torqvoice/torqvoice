import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Driving a work order through the browser the way a workshop does.
 *
 * Everything here reads visible English and the placeholders the editors
 * print; the suite pins the locale so both hold. Clicks that add a row are
 * retried until the row is there: a click that lands before React has
 * hydrated the page does nothing, and the editor gives no other sign.
 */

/** The address of one seeded vehicle, found through the list's own search. */
export async function seededVehicleUrl(page: Page, search = 'Camry'): Promise<string> {
  await page.goto(`/vehicles?search=${encodeURIComponent(search)}`)
  await page
    .getByRole('link', { name: new RegExp(search, 'i') })
    .first()
    .click()
  await page.waitForURL(/\/vehicles\/[^/?]+$/)
  return page.url()
}

/** A fresh draft work order on the vehicle, titled, open in the editor. */
export async function newWorkOrder(page: Page, vehicleUrl: string, title: string): Promise<string> {
  await page.goto(`${vehicleUrl}/service/new`)
  await page.waitForURL(/\/vehicles\/[^/]+\/service\/[^/]+$/)
  // The page carries the field twice, one per breakpoint, both with the same
  // id; only the one for this viewport is visible.
  const titleField = page.locator('input[placeholder="Oil Change"]:visible')
  await expect(titleField).toBeVisible()
  await titleField.fill(title)
  return page.url()
}

/** The editor row an input belongs to: the nearest ancestor that also holds the given input. */
function rowContaining(field: Locator, siblingPlaceholder: string): Locator {
  return field.locator(`xpath=ancestor::*[.//input[@placeholder="${siblingPlaceholder}"]][1]`)
}

export interface PartInput {
  name: string
  quantity: number
  /** Vendor cost; with a markup the unit price is expected to follow from it. */
  cost?: number
  markupPercent?: number
  unitPrice?: number
}

/**
 * Adds a part line. The number inputs sit in the order the editor prints
 * them: quantity, cost, markup, unit price.
 */
export async function addPart(page: Page, part: PartInput): Promise<void> {
  const name = page.getByPlaceholder('Name *').last()
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Part' }).last().click()
    await expect(name).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await name.fill(part.name)

  const numbers = rowContaining(name, 'Cost').locator('input[type="number"]')
  await numbers.nth(0).fill(String(part.quantity))
  if (part.cost !== undefined) await numbers.nth(1).fill(String(part.cost))
  if (part.markupPercent !== undefined) await numbers.nth(2).fill(String(part.markupPercent))
  if (part.unitPrice !== undefined) await numbers.nth(3).fill(String(part.unitPrice))
}

/** What the editor worked out as the unit price of the last part line. */
export async function lastPartUnitPrice(page: Page): Promise<string> {
  const name = page.getByPlaceholder('Name *').last()
  return rowContaining(name, 'Cost').locator('input[type="number"]').nth(3).inputValue()
}

export interface LaborInput {
  description: string
  hours: number
  rate: number
}

/** Adds an hourly labour line: description, hours, rate. */
export async function addLabor(page: Page, labor: LaborInput): Promise<void> {
  const description = page.getByPlaceholder('Description *').last()
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Labor' }).last().click()
    await expect(description).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await description.fill(labor.description)

  const numbers = rowContaining(description, 'Hours').locator('input[type="number"]')
  await numbers.nth(0).fill(String(labor.hours))
  await numbers.nth(1).fill(String(labor.rate))
}

/** Saves the work order and waits for the header to say so. */
export async function saveWorkOrder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
}

/**
 * One line of the totals panel, found by its label. The panel prints each
 * line as a label and a figure side by side, so the row is the label's
 * parent and the figure is read from it.
 */
export function totalsRow(page: Page, label: string): Locator {
  // Scoped to the Totals panel: "Parts" and "Labor" are also section headings.
  const panel = page
    .getByRole('heading', { name: 'Totals', exact: true })
    .locator('xpath=ancestor::div[1]')
  // The row is the nearest box that spreads label and figure apart; the tax
  // label sits one level deeper, beside its percentage input.
  return panel
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
}

/** Sets the discount on the open work order. */
export async function setDiscount(
  page: Page,
  kind: 'None' | 'Percentage' | 'Fixed',
  value?: number
): Promise<void> {
  const row = totalsRow(page, 'Discount')
  await row.getByRole('combobox').click()
  await page.getByRole('option', { name: kind, exact: true }).click()
  if (value !== undefined) await row.locator('input[type="number"]').fill(String(value))
}

/** The public share link for the open work order, generating it if needed. */
export async function shareLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const generate = dialog.getByRole('button', { name: /generate public link/i })
  if (await generate.isVisible()) {
    await generate.click()
    // A job that has gone to the customer is asked to leave the work board.
    const prompt = page.getByRole('alertdialog', { name: /mark this invoice as completed/i })
    const asked = await prompt
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
    if (asked) await prompt.getByRole('button', { name: 'Mark completed', exact: true }).click()
  }
  const field = dialog.locator('input[readonly]')
  await expect(field).toHaveValue(/\/share\/invoice\//)
  const url = await field.inputValue()
  await page.keyboard.press('Escape')
  return url
}
