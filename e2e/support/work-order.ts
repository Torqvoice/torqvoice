import { expect, type Locator, type Page } from '@playwright/test'
import { settle } from './hydration'

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
  // `/service/new` makes the draft and redirects to it, and for a moment the
  // page being left and the page arriving are both in the document: two title
  // fields, and a strict-mode error instead of a retry. Settled, there is one.
  await settle(page)
  const titleField = page.locator('input[name="title"]')
  await expect(titleField).toBeVisible()
  await titleField.fill(title)
  return page.url()
}

/** The editor row an input belongs to: the nearest ancestor that also holds the given input. */
function rowContaining(field: Locator, siblingPlaceholder: string): Locator {
  return field.locator(`xpath=ancestor::*[.//input[@placeholder="${siblingPlaceholder}"]][1]`)
}

/**
 * The part rows, in the order the editor lists them. One locator per row: the
 * page used to draw the whole editor twice, once per breakpoint, and every row
 * came back doubled with half of them impossible to type into.
 * `specs/work-orders/layout.spec.ts` is what keeps it to one.
 */
export function partRows(page: Page): Locator {
  return page.getByPlaceholder('Name *')
}

/** The labour rows, likewise. */
export function laborRows(page: Page): Locator {
  return page.getByPlaceholder('Description *')
}

/** The whole row a part field sits in, buttons and figures included. */
export function partRowOf(nameField: Locator): Locator {
  return rowContaining(nameField, 'Cost')
}

/** The whole row a labour field sits in. */
export function laborRowOf(descriptionField: Locator): Locator {
  return rowContaining(descriptionField, 'Hours')
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
  const rows = partRows(page)
  // Counted first, and waited for: a click before hydration adds nothing, and
  // a guard that only asked whether some name field was on screen would be
  // satisfied by the rows already there and type over the last of them.
  const before = await rows.count()
  await expect(async () => {
    // An empty list offers the button twice, in the toolbar and as the dashed
    // row beneath it; once there are rows, only the toolbar one is named.
    await page.getByRole('button', { name: 'Add Part' }).last().click()
    await expect(rows).toHaveCount(before + 1, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // The toolbar button puts the new row at the top of the list, which is
  // where the workshop looks after clicking it; the dashed one appends, and
  // on an empty list either way leaves the row it made as the only one.
  const name = rows.first()
  await name.fill(part.name)

  const numbers = rowContaining(name, 'Cost').locator('input[type="number"]')
  await numbers.nth(0).fill(String(part.quantity))
  if (part.cost !== undefined) await numbers.nth(1).fill(String(part.cost))
  if (part.markupPercent !== undefined) await numbers.nth(2).fill(String(part.markupPercent))
  if (part.unitPrice !== undefined) await numbers.nth(3).fill(String(part.unitPrice))
}

/** What the editor worked out as the unit price of the part added last. */
export async function lastPartUnitPrice(page: Page): Promise<string> {
  return partRowOf(partRows(page).first()).locator('input[type="number"]').nth(3).inputValue()
}

export interface LaborInput {
  description: string
  hours: number
  rate: number
}

/** Adds an hourly labour line: description, hours, rate. */
export async function addLabor(page: Page, labor: LaborInput): Promise<void> {
  const rows = laborRows(page)
  const before = await rows.count()
  await expect(async () => {
    await page.getByRole('button', { name: 'Add Labor' }).last().click()
    await expect(rows).toHaveCount(before + 1, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // Added at the top, like a part.
  const description = rows.first()
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

  // A document whose invoice date has passed is offered a fresh one before it
  // goes out. Declined here: a spec that shares a seeded invoice must hand the
  // customer the document as it stands, not rewrite its dates on the way.
  const expired = page.getByRole('dialog', { name: /invoice dates expired/i })
  const asksAboutDates = await expired
    .waitFor({ state: 'visible', timeout: 3_000 })
    .then(() => true)
    .catch(() => false)
  if (asksAboutDates) {
    await expired.getByRole('button', { name: /proceed without changes/i }).click()
  }

  // By name: a workshop-wide announcement is a dialog too, and can be open on
  // the same page.
  const dialog = page.getByRole('dialog', { name: 'Share Invoice' })
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
