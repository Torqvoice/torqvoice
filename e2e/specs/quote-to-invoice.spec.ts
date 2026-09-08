import { test, expect, type Page } from '@playwright/test'

/**
 * The path a workshop actually walks: quote a job, price it, turn it into a
 * work order, and end up with an invoice number a customer will see.
 *
 * Serial and stateful on purpose. Each step needs the record the previous one
 * created, and splitting them into independent tests would mean seeding three
 * near-identical work orders to assert one thing each.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const QUOTE_TITLE = `E2E brake job ${stamp}`
const LABOR_HOURS = '2'
const LABOR_RATE = '900'
const PART_NAME = `E2E brake pads ${stamp}`

let quoteUrl = ''
let workOrderUrl = ''

/** The row an editor input sits in, so sibling fields can be filled by position. */
function rowOf(page: Page, field: ReturnType<Page['getByPlaceholder']>) {
  void page
  return field.locator('xpath=ancestor::div[contains(@class,"grid")][1]')
}

test.describe('quote to invoice', () => {
  test('a quote can be created against a seeded vehicle', async ({ page }) => {
    // The list opens its dialog from the query string, which saves hunting for
    // a button that moves between the toolbar and a mobile icon.
    await page.goto('/quotes?create=true')

    await page.locator('#new-quote-title').fill(QUOTE_TITLE)

    await page.getByRole('combobox', { name: /select vehicle/i }).click()
    await page.getByPlaceholder('Select vehicle...').fill('Camry')
    await page.getByRole('option', { name: /Camry/i }).first().click()

    await page.getByRole('button', { name: 'Create Quote' }).click()

    await page.waitForURL(/\/quotes\/[^/]+$/)
    quoteUrl = page.url()
    await expect(page.locator('#title')).toHaveValue(QUOTE_TITLE)
  })

  test('labor priced on the quote reaches the totals', async ({ page }) => {
    await page.goto(quoteUrl)

    await page.getByRole('button', { name: 'Add Labor' }).click()

    const description = page.getByPlaceholder('Description *').last()
    await description.fill('Diagnose and replace front brake pads')

    const row = rowOf(page, description)
    await row.getByPlaceholder('Hours').fill(LABOR_HOURS)
    // Hours first, rate second, in the order the editor renders them.
    await row.locator('input[type="number"]').nth(1).fill(LABOR_RATE)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Quote saved')).toBeVisible()

    // 2 × 900. Matched loosely because the thousands separator follows the
    // workshop's locale, and the assertion is about arithmetic, not formatting.
    await expect(page.getByText(/1[\s., ]?800/).first()).toBeVisible()
  })

  test('the quote converts into a work order', async ({ page }) => {
    await page.goto(quoteUrl)

    await page.getByRole('button', { name: 'Convert to Work Order' }).click()
    await page.getByRole('button', { name: 'Convert', exact: true }).click()

    await page.waitForURL(/\/vehicles\/[^/]+\/service\/[^/]+$/)
    workOrderUrl = page.url()

    // The labour the quote carried has to arrive with it, or the conversion has
    // quietly produced an empty job.
    await expect(page.getByPlaceholder('Description *').first()).toHaveValue(/front brake pads/i)
  })

  test('parts added to the work order land in an invoice with a number', async ({ page }) => {
    await page.goto(workOrderUrl)

    await page.getByRole('button', { name: 'Add Part' }).click()
    const name = page.getByPlaceholder('Name *').last()
    await name.fill(PART_NAME)

    const row = rowOf(page, name)
    const numbers = row.locator('input[type="number"]')
    await numbers.nth(0).fill('1')
    await numbers.nth(1).fill('450')

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved')).toBeVisible()

    // An invoice number is assigned by the workshop's numbering rules, not
    // typed. Any value at all means the sequence ran.
    const invoiceNumber = page.getByLabel('Invoice Number')
    await expect(invoiceNumber).not.toHaveValue('')
  })

  test('an issued invoice keeps its number across a reload', async ({ page }) => {
    await page.goto(workOrderUrl)

    const before = await page.getByLabel('Invoice Number').inputValue()

    await page.getByRole('button', { name: 'Mark as Paid' }).click()
    await expect(page.getByText('Paid', { exact: true }).first()).toBeVisible()

    await page.reload()

    // Issuing freezes the document. A number that moves afterwards means the
    // snapshot is not holding, which is the bug worth catching before customers
    // hold two invoices with the same number.
    await expect(page.getByLabel('Invoice Number')).toHaveValue(before)
  })
})
