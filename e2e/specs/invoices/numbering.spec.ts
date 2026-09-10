import { expect, test } from '@playwright/test'
import { invoiceStartNumber, setInvoiceNumbering } from '../../support/settings'
import { newWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * The number on the invoice: what the workshop's format does to it, where the
 * sequence can be made to jump, and that it only ever goes up.
 *
 * Two customers holding invoices with the same number is the kind of bug an
 * accountant finds rather than a workshop, so each rule is a test of its own.
 * Where the sequence stands depends on what the rest of the suite has already
 * created, so the numbers are read from the first job and the later
 * assertions are exact against that, which also lets the file be run twice on
 * the same database.
 */

test.describe.configure({ mode: 'serial' })

/** How far ahead of the sequence the workshop is made to jump. */
const JUMP = 500

let vehicleUrl = ''
let year = ''
let month = ''
/** The number the sequence had reached when this run started. */
let firstNumber = 0

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  // The tokens are filled in from the workshop's own clock, which the suite
  // pins to one timezone for the browser and the server alike.
  const now = await page.evaluate(() => ({
    year: String(new Date().getFullYear()),
    month: String(new Date().getMonth() + 1).padStart(2, '0'),
  }))
  year = now.year
  month = now.month
  await page.close()
})

test.describe('invoice numbering', () => {
  test('the workshop format decorates the number', async ({ page }) => {
    await setInvoiceNumbering(page, { prefix: 'E2E-{year}-' })

    await newWorkOrder(page, vehicleUrl, 'E2E numbering, in sequence')

    const number = await page.getByLabel('Invoice Number').inputValue()
    expect(number, 'the format is applied to whatever number came next').toMatch(
      new RegExp(`^E2E-${year}-\\d+$`)
    )
    firstNumber = Number(number.split('-').pop())
  })

  test('the sequence can be made to jump', async ({ page }) => {
    const asked = firstNumber + JUMP
    await setInvoiceNumbering(page, { prefix: 'E2E-{year}-', startNumber: String(asked) })

    await newWorkOrder(page, vehicleUrl, `E2E numbering, jumped to ${asked}`)

    await expect(page.getByLabel('Invoice Number')).toHaveValue(`E2E-${year}-${asked}`)
  })

  test('the number asked for is spent once, not every time', async ({ page }) => {
    // Left standing, the field would hand the same number to every job that
    // followed it, so the app clears it as soon as one has taken it.
    expect(await invoiceStartNumber(page)).toBe('')
  })

  test('the next job carries on from the last, whatever the format says', async ({ page }) => {
    // Only the decoration changes. A workshop that starts numbering by month
    // partway through the year does not start the sequence again.
    await setInvoiceNumbering(page, { prefix: 'E2E-{year}-{month}-' })

    await newWorkOrder(page, vehicleUrl, 'E2E numbering, carried on')

    await expect(page.getByLabel('Invoice Number')).toHaveValue(
      `E2E-${year}-${month}-${firstNumber + JUMP + 1}`
    )
  })

  test('the numbering settings are put back', async ({ page }) => {
    await setInvoiceNumbering(page, { prefix: '{year}-' })
    expect(await invoiceStartNumber(page)).toBe('')
  })
})
