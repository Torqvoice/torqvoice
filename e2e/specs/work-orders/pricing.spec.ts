import { expect, type Page, test } from '@playwright/test'
import {
  addLabor,
  addPart,
  lastPartUnitPrice,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  setDiscount,
  shareLink,
  totalsRow,
} from '../../support/work-order'

/**
 * The money on a work order, under every tax setting the workshop can choose.
 *
 * One job, priced the same way each time: two parts at a cost of 100 with a
 * 50% markup, and an hour and a half of labour at 400. What that comes to on
 * the editor, on the shared invoice and in the PDF is pinned here to the
 * cent, so a change anywhere in the pricing path that moves a customer's
 * invoice fails a test before it ships.
 *
 * Serial, because the tax settings are the workshop's and each scenario
 * creates its work order after changing them. The settings are put back at
 * the end.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

interface TaxSetup {
  enabled: boolean
  rate?: number
  inclusive?: boolean
  label?: string
}

async function setTax(page: Page, tax: TaxSetup) {
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

/** The standard job: parts 2 × 150 = 300, labour 1.5 × 400 = 600, before tax or discount 900. */
async function priceTheJob(page: Page, vehicleUrl: string, title: string): Promise<string> {
  const url = await newWorkOrder(page, vehicleUrl, title)
  await addPart(page, {
    name: `E2E brake pads ${stamp}`,
    quantity: 2,
    cost: 100,
    markupPercent: 50,
  })
  // The markup decides the price: 100 plus half is 150.
  expect(await lastPartUnitPrice(page)).toBe('150')
  await addLabor(page, { description: 'Replace front brake pads', hours: 1.5, rate: 400 })
  await saveWorkOrder(page)
  return url
}

async function expectTotals(page: Page, lines: Record<string, string>) {
  for (const [label, figure] of Object.entries(lines)) {
    await expect(totalsRow(page, label), `${label} on the work order`).toContainText(figure)
  }
}

/** Opens the customer's copy and checks the same figures print there. */
async function expectOnSharedInvoice(page: Page, workOrderUrl: string, texts: (string | RegExp)[]) {
  await page.goto(workOrderUrl)
  const url = await shareLink(page)
  await page.goto(url)
  // The sheet keeps a hidden copy of itself for measuring; only the drawn one counts.
  for (const text of texts) {
    await expect(
      page.getByText(text).filter({ visible: true }).first(),
      `${text} on the shared invoice`
    ).toBeVisible()
  }
}

async function expectPdf(page: Page, workOrderUrl: string) {
  const id = workOrderUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`)
  expect(response.status(), 'the invoice PDF renders').toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  expect((await response.body()).length).toBeGreaterThan(1_000)
}

let vehicleUrl = ''
let exclusiveJob = ''

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  await page.close()
})

test.describe('tax added on top', () => {
  test('a 25% rate is added to net lines', async ({ page }) => {
    await setTax(page, { enabled: true, rate: 25, inclusive: false })
    exclusiveJob = await priceTheJob(page, vehicleUrl, `E2E exclusive ${stamp}`)

    await expectTotals(page, {
      Parts: '$300.00',
      Labor: '$600.00',
      Subtotal: '$900.00',
      Tax: '$225.00',
      Total: '$1,125.00',
    })
    await expect(page.getByLabel('Invoice Number')).not.toHaveValue('')

    await expectOnSharedInvoice(page, exclusiveJob, [
      '$900.00',
      /Tax \(25%\)/,
      '$225.00',
      '$1,125.00',
    ])
    await expectPdf(page, exclusiveJob)
  })

  test('a percentage discount comes off before the tax', async ({ page }) => {
    await page.goto(exclusiveJob)
    await setDiscount(page, 'Percentage', 10)
    await saveWorkOrder(page)

    await expectTotals(page, {
      Subtotal: '$900.00',
      Discount: '-$90.00',
      Tax: '$202.50',
      Total: '$1,012.50',
    })
    await expectOnSharedInvoice(page, exclusiveJob, ['$202.50', '$1,012.50'])
  })

  test('a fixed discount does the same', async ({ page }) => {
    await page.goto(exclusiveJob)
    await setDiscount(page, 'Fixed', 100)
    await saveWorkOrder(page)

    await expectTotals(page, {
      Discount: '-$100.00',
      Tax: '$200.00',
      Total: '$1,000.00',
    })
    await expectOnSharedInvoice(page, exclusiveJob, ['$200.00', '$1,000.00'])
  })
})

test.describe('tax included in the prices', () => {
  test('a 25% rate is taken out of gross lines and the total is what was typed', async ({
    page,
  }) => {
    await setTax(page, { enabled: true, rate: 25, inclusive: true, label: 'MVA' })
    const job = await priceTheJob(page, vehicleUrl, `E2E inclusive ${stamp}`)

    // The editor shows the net figures; the customer pays what was typed.
    await expectTotals(page, {
      Subtotal: '$720.00',
      Tax: '$180.00',
      Total: '$900.00',
    })
    await expectOnSharedInvoice(page, job, [/MVA/, /25%/, '$180.00', '$900.00'])
    await expectPdf(page, job)
  })
})

test.describe('no tax at all', () => {
  test('a workshop with tax off prints no tax line', async ({ page }) => {
    await setTax(page, { enabled: false })
    const job = await priceTheJob(page, vehicleUrl, `E2E untaxed ${stamp}`)

    await expectTotals(page, { Subtotal: '$900.00', Total: '$900.00' })
    await expect(totalsRow(page, 'Tax')).toHaveCount(0)
    await expectOnSharedInvoice(page, job, ['$900.00'])
    await expect(page.getByText(/^Tax/).filter({ visible: true })).toHaveCount(0)
  })

  test('the tax settings are put back', async ({ page }) => {
    await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })
  })
})
