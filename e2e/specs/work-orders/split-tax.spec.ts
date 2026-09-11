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
 * A workshop in Québec: two taxes on every job, each on its own line, each
 * with its own registration number, and each totalled apart in the report.
 *
 * The job is the one the pricing spec prices, 900 before tax, so the
 * figures here follow from those: GST at 5% is 45.00 and QST at 9.975% is
 * 89.775, which the sheet must print as 89.78 and add to 1,034.78. With the
 * 10% discount the base is 810, GST 40.50, QST 80.7975 printed as 80.80,
 * and the total 931.30. The split is opt-in, so the last test turns it off
 * again and shows a new job is back to one tax line.
 *
 * Serial: the tax settings are the workshop's, and every job here is created
 * after they change.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const GST_NUMBER = '123456789 RT0001'
const QST_NUMBER = '1234567890 TQ0001'

let vehicleUrl = ''
let job = ''

/** The standard job: parts 2 × 150 = 300, labour 1.5 × 400 = 600, before tax 900. */
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

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  await page.close()
})

test('the settings page takes the Québec preset and remembers the registration numbers', async ({
  page,
}) => {
  await page.goto('/settings/tax')
  const split = page.locator('#taxSplit')
  await expect(split).toBeVisible()
  await expect(async () => {
    if ((await split.getAttribute('aria-checked')) !== 'true') await split.click()
    await expect(split).toHaveAttribute('aria-checked', 'true')
  }).toPass()

  // The preset fills the names and rates; the numbers are the workshop's own.
  await page.locator('#taxPreset').click()
  await page.getByRole('option', { name: 'Québec, Canada (GST + QST)' }).click()
  await expect(page.locator('#taxComponentName-0')).toHaveValue('GST')
  await expect(page.locator('#taxComponentRate-0')).toHaveValue('5')
  await expect(page.locator('#taxComponentName-1')).toHaveValue('QST')
  await expect(page.locator('#taxComponentRate-1')).toHaveValue('9.975')
  await expect(page.getByTestId('tax-combined-rate')).toHaveText('14.975%')
  // The single-rate fields have left the page: there is one rate now, the sum.
  await expect(page.locator('#defaultTaxRate')).toHaveCount(0)
  await expect(page.locator('#taxLabel')).toHaveCount(0)

  await page.locator('#taxComponentRegistration-0').fill(GST_NUMBER)
  await page.locator('#taxComponentRegistration-1').fill(QST_NUMBER)
  await page.getByRole('button', { name: 'Exclusive', exact: true }).click()
  await page.getByRole('button', { name: 'Save Settings', exact: true }).click()
  await expect(page.getByText('Settings saved', { exact: true })).toBeVisible()

  await page.reload()
  await settle(page)
  await expect(page.locator('#taxSplit')).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('#taxComponentName-1')).toHaveValue('QST')
  await expect(page.locator('#taxComponentRegistration-0')).toHaveValue(GST_NUMBER)
  await expect(page.locator('#taxComponentRegistration-1')).toHaveValue(QST_NUMBER)
  await expect(page.getByTestId('tax-combined-rate')).toHaveText('14.975%')
})

test('the invoice designer draws the split on its sample sheet', async ({ page }) => {
  await page.goto('/invoice-designer?view=designer&doc=invoice')
  // The canvas keeps a hidden measuring copy of the sheet; only the drawn
  // one counts, so every check is on visible text.
  const drawn = (text: string | RegExp) => page.getByText(text).filter({ visible: true }).first()
  await expect(drawn(/GST \(5%\)/)).toBeVisible()
  await expect(drawn(/QST \(9\.975%\)/)).toBeVisible()
  await expect(drawn(GST_NUMBER)).toBeVisible()
  await expect(drawn(QST_NUMBER)).toBeVisible()
  await expect(page.getByText(/^Tax \(/).filter({ visible: true })).toHaveCount(0)

  // The template cards in settings are drawn from the same sample.
  await page.goto('/settings/templates')
  await expect(page.getByText('GST (5%)').first()).toBeAttached()
})

test('a job charges GST and QST on their own lines', async ({ page }) => {
  job = await priceTheJob(page, `E2E Québec ${stamp}`)
  await expectTotals(page, {
    Parts: '$300.00',
    Labor: '$600.00',
    Subtotal: '$900.00',
    'GST (5%)': '$45.00',
    'QST (9.975%)': '$89.78',
    Total: '$1,034.78',
  })
  // No combined line, and no rate field: the split is the workshop's.
  await expect(totalsRow(page, 'Tax')).toHaveCount(0)
  await expect(page.getByTestId('tax-component-row')).toHaveCount(2)
  await expect(page.getByTestId('tax-component-row').locator('input')).toHaveCount(0)
})

test('a discount comes off before both taxes', async ({ page }) => {
  await page.goto(job)
  await setDiscount(page, 'Percentage', 10)
  await saveWorkOrder(page)
  await expectTotals(page, {
    Discount: '-$90.00',
    'GST (5%)': '$40.50',
    'QST (9.975%)': '$80.80',
    Total: '$931.30',
  })

  // The saved figures survive a reload: the server re-derived the split.
  await page.reload()
  await settle(page)
  await expectTotals(page, { 'GST (5%)': '$40.50', 'QST (9.975%)': '$80.80', Total: '$931.30' })
})

test('the customer copy and the PDF print both taxes and both registration numbers', async ({
  page,
}) => {
  await page.goto(job)
  const url = await shareLink(page)
  await page.goto(url)
  // The sheet keeps a hidden copy of itself for measuring; only the drawn one counts.
  for (const text of [
    /GST \(5%\)/,
    /QST \(9\.975%\)/,
    '$40.50',
    '$80.80',
    '$931.30',
    GST_NUMBER,
    QST_NUMBER,
  ]) {
    await expect(
      page.getByText(text).filter({ visible: true }).first(),
      `${text} on the shared invoice`
    ).toBeVisible()
  }
  await expect(page.getByText(/^Tax \(/).filter({ visible: true })).toHaveCount(0)

  const id = job.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`)
  expect(response.status(), 'the invoice PDF renders').toBe(200)
  const pdf = await pdfContent(await response.body())
  for (const text of [
    'GST (5%)',
    'QST (9.975%)',
    '40.50',
    '80.80',
    '931.30',
    'GST No.',
    GST_NUMBER,
    'QST No.',
    QST_NUMBER,
  ]) {
    expect(pdf.flat, `${text} in the PDF`).toContain(text)
  }
  expect(pdf.flat).not.toMatch(/Tax \(14/)
})

test('a quote shows the same split', async ({ page }) => {
  await newQuote(page, `E2E Québec quote ${stamp}`)
  await addQuotePart(page, { name: `E2E tyre ${stamp}`, quantity: 2, unitPrice: 150 })
  await addQuoteLabor(page, { description: 'Fit tyres', hours: 1.5, rate: 400 })
  await saveQuote(page)

  const rows = page.getByTestId('tax-component-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('GST (5%)')
  await expect(rows.nth(0)).toContainText('$45.00')
  await expect(rows.nth(1)).toContainText('QST (9.975%)')
  await expect(rows.nth(1)).toContainText('$89.78')
})

test('the tax report totals each tax by name', async ({ page }) => {
  // The job was booked into the next free slot, which is usually tomorrow,
  // and the report runs to the present moment; move it into the past.
  await scheduleServiceRecordInThePast(job.split('/').pop()!)
  await page.goto('/reports?tab=financial&subtab=tax')
  const table = page
    .getByRole('heading', { name: 'Tax by Rate' })
    .locator('xpath=ancestor::div[.//table][1]')
    .getByRole('table')
  await expect(table).toBeVisible()
  const gst = table.getByRole('row').filter({ hasText: 'GST (5%)' })
  const qst = table.getByRole('row').filter({ hasText: 'QST (9.975%)' })
  await expect(gst).toHaveCount(1)
  await expect(qst).toHaveCount(1)
  // Each row carries money and a count; the exact figures depend on what
  // earlier runs left in the period, so the shape is what is pinned.
  await expect(gst).toContainText(/\$\d/)
  await expect(qst).toContainText(/\$\d/)
})

test('switching the split off puts a new job back on one tax line', async ({ page }) => {
  await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })
  await page.goto('/settings/tax')
  await expect(page.locator('#taxSplit')).toHaveAttribute('aria-checked', 'false')
  await expect(page.locator('#defaultTaxRate')).toHaveValue('25')

  await priceTheJob(page, `E2E single again ${stamp}`)
  await expectTotals(page, { Tax: '$225.00', Total: '$1,125.00' })
  await expect(page.getByTestId('tax-component-row')).toHaveCount(0)

  // The Québec job keeps the taxes it was made with.
  await page.goto(job)
  await expectTotals(page, { 'GST (5%)': '$40.50', 'QST (9.975%)': '$80.80' })
})
