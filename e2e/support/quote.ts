import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Driving a quote through the browser.
 *
 * The quote editor is close to the work order's and not the same: it renders
 * once at any width (a JavaScript breakpoint rather than two hidden copies),
 * and its Add buttons append rather than prepend, so the row just made is the
 * last one. The placeholders are shared, which is why these read the same as
 * the work order helpers next door.
 */

/** A fresh quote against a seeded vehicle, open in the editor. */
export async function newQuote(page: Page, title: string, vehicle = 'Camry'): Promise<string> {
  // The list opens its dialog from the query string, which saves hunting for
  // a button that moves between the toolbar and a mobile icon.
  await page.goto('/quotes?create=true')
  await page.locator('#new-quote-title').fill(title)

  // The picker is a button in the combobox role whose only name is its
  // placeholder, so it is found by what it says.
  await page
    .getByRole('combobox')
    .filter({ hasText: /select vehicle/i })
    .click()
  await page.getByPlaceholder('Select vehicle...').fill(vehicle)
  await page
    .getByRole('option', { name: new RegExp(vehicle, 'i') })
    .first()
    .click()

  await page.getByRole('button', { name: 'Create Quote' }).click()
  await page.waitForURL(/\/quotes\/[^/]+$/)
  await expect(page.locator('#title')).toHaveValue(title)
  return page.url()
}

/** The row an editor input belongs to: the nearest ancestor holding its sibling. */
function rowContaining(field: Locator, siblingPlaceholder: string): Locator {
  return field.locator(`xpath=ancestor::*[.//input[@placeholder="${siblingPlaceholder}"]][1]`)
}

/**
 * The row a part field sits in. Unlike the work order's, the quote's number
 * inputs carry no placeholders at all, so the row is found as the nearest
 * ancestor that holds one.
 */
function partRowOf(nameField: Locator): Locator {
  return nameField.locator('xpath=ancestor::div[.//input[@type="number"]][1]')
}

export interface QuotePart {
  name: string
  quantity: number
  unitPrice: number
}

/** Adds a part line. The numbers sit in the order the editor prints them. */
export async function addQuotePart(page: Page, part: QuotePart): Promise<void> {
  const rows = page.getByPlaceholder('Name *')
  const before = await rows.count()
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Part', exact: true }).first().click()
    await expect(rows).toHaveCount(before + 1, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // Appended, so the new row is the last.
  const name = rows.last()
  await name.fill(part.name)
  // Quantity, cost, markup, unit price, in the order the editor prints them.
  const numbers = partRowOf(name).locator('input[type="number"]')
  await numbers.nth(0).fill(String(part.quantity))
  await numbers.nth(3).fill(String(part.unitPrice))
}

export interface QuoteLabor {
  description: string
  hours: number
  rate: number
}

/** Adds an hourly labour line. */
export async function addQuoteLabor(page: Page, labor: QuoteLabor): Promise<void> {
  const rows = page.getByPlaceholder('Description *')
  const before = await rows.count()
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Labor', exact: true }).first().click()
    await expect(rows).toHaveCount(before + 1, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  const description = rows.last()
  await description.fill(labor.description)
  const numbers = rowContaining(description, 'Hours').locator('input[type="number"]')
  await numbers.nth(0).fill(String(labor.hours))
  await numbers.nth(1).fill(String(labor.rate))
}

/** Saves the quote and waits for the header to say so. */
export async function saveQuote(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Quote saved')).toBeVisible()
}

/** The public link for the open quote, generating it if there is none yet. */
export async function quoteShareLink(page: Page): Promise<string> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Share Quote' })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  const dialog = page.getByRole('dialog', { name: 'Share Quote' })
  const generate = dialog.getByRole('button', { name: /generate public link/i })
  if (await generate.isVisible().catch(() => false)) await generate.click()

  const field = dialog.locator('input[readonly]')
  await expect(field).toHaveValue(/\/share\/quote\//)
  const url = await field.inputValue()
  await page.keyboard.press('Escape')
  return url
}

/** The public quote PDF behind a share link. */
export function quotePdfUrl(shareUrl: string): string {
  const [orgId, token] = new URL(shareUrl).pathname.split('/').slice(-2)
  return `/api/public/share/quote/${orgId}/${token}/pdf`
}
