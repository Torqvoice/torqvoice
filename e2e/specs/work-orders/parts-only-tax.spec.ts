import { expect, type Page, test } from '@playwright/test'
import { scheduleServiceRecordInThePast } from '../../support/db'
import { settle } from '../../support/hydration'
import { pdfContent } from '../../support/pdf'
import { addQuoteLabor, addQuotePart, newQuote, saveQuote } from '../../support/quote'
import { setTax } from '../../support/settings'
import {
  addLabor,
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  setDiscount,
  shareLink,
  totalsRow,
} from '../../support/work-order'

/**
 * A workshop where the sales tax is on parts and not on labor, which is the
 * rule in a good many US states and the question a workshop wrote in with.
 *
 * The job is the one the pricing spec prices: parts 2 x 150 = 300, labor
 * 1.5 x 400 = 600, so 900 before tax. At 8% on the parts alone the tax is
 * 24.00 and the total 924.00, where taxing everything would say 72.00 and
 * 972.00. With the 10% discount the 90 comes off both in proportion: the
 * parts are a third of the job, so the taxable amount is 270.00, the tax
 * 21.60 and the total 831.60.
 *
 * Serial: the tax settings are the workshop's, every job here is created
 * after they change, and the last test puts them back.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

let vehicleUrl = ''
let job = ''

async function priceTheJob(page: Page, title: string): Promise<string> {
  const url = await newWorkOrder(page, vehicleUrl, title)
  await addPart(page, {
    name: `E2E brake pads ${stamp}`,
    quantity: 2,
    cost: 100,
    markupPercent: 50,
  })
  await addLabor(page, { description: 'Replace front brake pads', hours: 1.5, rate: 400 })
  await saveWorkOrder(page)
  return url
}

async function expectTotals(page: Page, lines: Record<string, string>) {
  for (const [label, figure] of Object.entries(lines)) {
    await expect(totalsRow(page, label), `${label} on the work order`).toContainText(figure)
  }
}

/** The switch on each line, top to bottom, as "true" or "false". */
async function lineTaxStates(page: Page): Promise<string[]> {
  const toggles = page.getByTestId('line-tax-toggle')
  return toggles.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-taxable') ?? '')
  )
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  await page.close()
})

test('a workshop that taxes everything sees no tax switch on its lines', async ({ page }) => {
  await setTax(page, { enabled: true, rate: 8, inclusive: false, label: '' })
  await priceTheJob(page, `E2E taxed in full ${stamp}`)
  await expect(page.getByTestId('line-tax-toggle')).toHaveCount(0)
  await expect(page.getByTestId('taxable-amount-row')).toHaveCount(0)
  await expectTotals(page, { Subtotal: '$900.00', Tax: '$72.00', Total: '$972.00' })
})

test('the settings page takes "parts only" and remembers it', async ({ page }) => {
  await page.goto('/settings/tax')
  // The three answers are not on the page until the workshop asks for them.
  await expect(page.getByTestId('tax-applies')).toHaveCount(0)

  await setTax(page, {
    enabled: true,
    rate: 8,
    inclusive: false,
    label: '',
    appliesTo: { parts: true, labor: false, shopFee: false },
  })

  await page.reload()
  await settle(page)
  await expect(page.locator('#taxSelective')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#taxOnParts')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#taxOnLabor')).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#taxOnShopFee')).toHaveAttribute('aria-checked', 'false')
})

test('a new job charges the tax on its parts and not on its labor', async ({ page }) => {
  job = await priceTheJob(page, `E2E parts only ${stamp}`)
  await expectTotals(page, {
    Parts: '$300.00',
    Labor: '$600.00',
    Subtotal: '$900.00',
    'Taxable amount': '$300.00',
    Tax: '$24.00',
    Total: '$924.00',
  })
  // Labor is listed above parts on the page; whichever comes first, there is
  // one line of each and exactly one of them is taxed.
  expect((await lineTaxStates(page)).sort()).toEqual(['false', 'true'])

  // What was stored is what was shown: the server worked the tax out itself.
  await page.reload()
  await settle(page)
  await expectTotals(page, { 'Taxable amount': '$300.00', Tax: '$24.00', Total: '$924.00' })
  expect((await lineTaxStates(page)).sort()).toEqual(['false', 'true'])
})

test('a discount comes off the taxed and the untaxed lines in proportion', async ({ page }) => {
  await page.goto(job)
  await setDiscount(page, 'Percentage', 10)
  await saveWorkOrder(page)
  await expectTotals(page, {
    Discount: '-$90.00',
    'Taxable amount': '$270.00',
    Tax: '$21.60',
    Total: '$831.60',
  })

  await page.reload()
  await settle(page)
  await expectTotals(page, { 'Taxable amount': '$270.00', Tax: '$21.60', Total: '$831.60' })
})

test('the customer copy and the PDF say what the tax was charged on', async ({ page }) => {
  await page.goto(job)
  const url = await shareLink(page)
  await page.goto(url)
  // The sheet keeps a hidden copy of itself for measuring; only the drawn one counts.
  for (const text of ['Taxable amount', '$270.00', '$21.60', '$831.60']) {
    await expect(
      page.getByText(text).filter({ visible: true }).first(),
      `${text} on the shared invoice`
    ).toBeVisible()
  }
  // Tax on everything would have printed these.
  await expect(page.getByText('$64.80').filter({ visible: true })).toHaveCount(0)
  await expect(page.getByText('$874.80').filter({ visible: true })).toHaveCount(0)

  const id = job.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`)
  expect(response.status(), 'the invoice PDF renders').toBe(200)
  const pdf = await pdfContent(await response.body())
  for (const text of ['Taxable amount', '270.00', 'Tax (8%)', '21.60', '831.60']) {
    expect(pdf.flat, `${text} in the PDF`).toContain(text)
  }
  expect(pdf.flat).not.toContain('64.80')
  expect(pdf.flat).not.toContain('874.80')
})

test('a line can be taxed or left out by hand, and the choice survives a save', async ({
  page,
}) => {
  await page.goto(job)
  await settle(page)
  // Tax the labor too: the whole job is taxed again and the row is gone.
  const untaxed = page.locator('[data-testid="line-tax-toggle"][data-taxable="false"]')
  await expect(async () => {
    if ((await untaxed.count()) > 0) await untaxed.first().click()
    await expect(untaxed).toHaveCount(0, { timeout: 2_000 })
  }).toPass()
  await expectTotals(page, { Tax: '$64.80', Total: '$874.80' })
  await expect(page.getByTestId('taxable-amount-row')).toHaveCount(0)
  await saveWorkOrder(page)

  await page.reload()
  await settle(page)
  expect(await lineTaxStates(page)).toEqual(['true', 'true'])
  await expectTotals(page, { Tax: '$64.80', Total: '$874.80' })

  // And back: leave every line out, and no tax is charged at all.
  const taxed = page.locator('[data-testid="line-tax-toggle"][data-taxable="true"]')
  await expect(async () => {
    if ((await taxed.count()) > 0) await taxed.first().click()
    await expect(taxed).toHaveCount(0, { timeout: 2_000 })
  }).toPass()
  await expectTotals(page, { 'Taxable amount': '$0.00', Tax: '$0.00', Total: '$810.00' })
  await saveWorkOrder(page)

  await page.reload()
  await settle(page)
  expect(await lineTaxStates(page)).toEqual(['false', 'false'])
  await expectTotals(page, { Tax: '$0.00', Total: '$810.00' })
})

test('a quote is taxed the same way', async ({ page }) => {
  await newQuote(page, `E2E parts only quote ${stamp}`)
  await addQuotePart(page, { name: `E2E tyre ${stamp}`, quantity: 2, unitPrice: 150 })
  await addQuoteLabor(page, { description: 'Fit tyres', hours: 1.5, rate: 400 })
  await saveQuote(page)

  const row = page.getByTestId('taxable-amount-row')
  await expect(row).toContainText('$300.00')
  await expect(page.getByText('$924.00').filter({ visible: true }).first()).toBeVisible()
  expect((await lineTaxStates(page)).sort()).toEqual(['false', 'true'])

  await page.reload()
  await settle(page)
  await expect(page.getByTestId('taxable-amount-row')).toContainText('$300.00')
  expect((await lineTaxStates(page)).sort()).toEqual(['false', 'true'])
})

test('the tax report counts only what was taxed', async ({ page }) => {
  // Put the first job's lines back to the workshop rule, so it reads 270 taxed.
  await page.goto(job)
  await settle(page)
  const toggles = page.getByTestId('line-tax-toggle')
  await expect(toggles).toHaveCount(2)
  // The part row is the one with a part number field beside it.
  const partToggle = page
    .getByPlaceholder('Part #')
    .first()
    .locator('xpath=ancestor::div[.//*[@data-testid="line-tax-toggle"]][1]')
    .getByTestId('line-tax-toggle')
  await expect(async () => {
    if ((await partToggle.getAttribute('data-taxable')) !== 'true') await partToggle.click()
    await expect(partToggle).toHaveAttribute('data-taxable', 'true', { timeout: 2_000 })
  }).toPass()
  await expectTotals(page, { 'Taxable amount': '$270.00', Tax: '$21.60', Total: '$831.60' })
  await saveWorkOrder(page)

  await scheduleServiceRecordInThePast(job.split('/').pop()!)
  await page.goto('/reports?tab=financial&subtab=tax')
  const table = page
    .getByRole('heading', { name: 'Tax by Rate' })
    .locator('xpath=ancestor::div[.//table][1]')
    .getByRole('table')
  await expect(table).toBeVisible()
  // Other runs leave jobs in the period, so the row's presence is what is
  // pinned here; the amount it was charged on is pinned in the unit tests.
  await expect(
    table
      .getByRole('row')
      .filter({ hasText: /(^|\D)8%/ })
      .first()
  ).toBeVisible()
})

test('switching it off taxes a new job in full and leaves the old one alone', async ({ page }) => {
  // The seed's own tax, which the pricing and parity specs are pinned to.
  await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })
  await page.goto('/settings/tax')
  await expect(page.locator('#taxSelective')).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('tax-applies')).toHaveCount(0)

  await priceTheJob(page, `E2E taxed in full again ${stamp}`)
  await expectTotals(page, { Tax: '$225.00', Total: '$1,125.00' })
  await expect(page.getByTestId('line-tax-toggle')).toHaveCount(0)
  await expect(page.getByTestId('taxable-amount-row')).toHaveCount(0)

  // The parts-only job keeps what it was made with, and its untaxed line
  // still shows its switch, so it can be seen and changed.
  await page.goto(job)
  await settle(page)
  await expectTotals(page, { 'Taxable amount': '$270.00', Tax: '$21.60', Total: '$831.60' })
  await expect(page.getByTestId('line-tax-toggle')).toHaveCount(1)
  await expect(page.getByTestId('line-tax-toggle')).toHaveAttribute('data-taxable', 'false')
})
