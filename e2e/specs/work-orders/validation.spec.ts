import { expect, test } from '@playwright/test'
import {
  addLabor,
  addPart,
  laborRows,
  newWorkOrder,
  partRowOf,
  partRows,
  saveWorkOrder,
  seededVehicleUrl,
  totalsRow,
} from '../../support/work-order'

/**
 * What the editor refuses to save, and what it says when it refuses.
 *
 * Each of these was silent once. A priced row with no name was dropped on the
 * way to the server, so the save succeeded and the money left the invoice
 * without a word; a negative figure made the browser refuse the submit on a
 * field it would not show, so Save did nothing at all and said nothing
 * either. The point of these tests is the message.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

let vehicleUrl = ''
/** The one job these tests keep trying to break; each test opens it afresh. */
let jobUrl = ''

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  await page.close()
})

/** Clicks Save and expects it to be refused with one sentence. */
async function expectRefused(page: import('@playwright/test').Page, message: RegExp) {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText(message).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText('Saved', { exact: true })).toHaveCount(0)
}

test.describe('a work order that cannot be saved says why', () => {
  test('a part with a price but no name is refused, and its money stays on screen', async ({
    page,
  }) => {
    jobUrl = await newWorkOrder(page, vehicleUrl, `E2E validation ${stamp}`)
    await addPart(page, { name: `E2E gasket ${stamp}`, quantity: 1, unitPrice: 500 })
    await saveWorkOrder(page)

    // A second row, priced, that nobody has named.
    await addPart(page, { name: 'to be emptied', quantity: 2, unitPrice: 300 })
    await partRows(page).first().fill('')
    await expect(totalsRow(page, 'Parts')).toContainText('$1,100.00')

    // The row says so on its own, before anybody reaches for Save.
    await expect(
      page.getByText('Rows without a part name are not saved.').filter({ visible: true })
    ).toBeVisible()
    await expectRefused(page, /every priced part needs a name/i)

    // Nothing was thrown away: the row and its money are still there to fix.
    await expect(totalsRow(page, 'Parts')).toContainText('$1,100.00')
    await expect(partRows(page)).toHaveCount(2)
  })

  test('naming it lets the save through with both lines', async ({ page }) => {
    await page.goto(jobUrl)
    await addPart(page, { name: 'to be named', quantity: 2, unitPrice: 300 })
    await partRows(page).first().fill('')
    await expect(async () => {
      await partRows(page).first().fill(`E2E hose ${stamp}`)
      await expect(totalsRow(page, 'Parts')).toContainText('$1,100.00', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)

    await page.reload()
    await expect(partRows(page)).toHaveCount(2)
    await expect(totalsRow(page, 'Parts')).toContainText('$1,100.00')
  })

  test('labour with hours but nothing said about it is refused too', async ({ page }) => {
    await page.goto(jobUrl)
    await addLabor(page, { description: 'to be emptied', hours: 3, rate: 900 })
    await laborRows(page).first().fill('')
    await expect(totalsRow(page, 'Labor')).toContainText('$2,700.00')

    await expect(
      page.getByText('Rows without a description are not saved.').filter({ visible: true })
    ).toBeVisible()
    await expectRefused(page, /needs a description/i)

    await laborRows(page).first().fill(`E2E fit the hose ${stamp}`)
    await saveWorkOrder(page)
    await expect(totalsRow(page, 'Labor')).toContainText('$2,700.00')
  })

  test('a negative quantity is refused in words, not by a dead button', async ({ page }) => {
    await page.goto(jobUrl)
    const quantity = partRowOf(partRows(page).first()).locator('input[type="number"]').first()
    await expect(async () => {
      await quantity.fill('-2')
      await expect(totalsRow(page, 'Parts')).toContainText('-', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await expectRefused(page, /cannot be negative/i)
  })

  test('a negative unit price is refused as well', async ({ page }) => {
    await page.goto(jobUrl)
    const row = partRowOf(partRows(page).first())
    const unitPrice = row.locator('input[type="number"]').nth(3)
    await expect(async () => {
      await unitPrice.fill('-10')
      // The row's own total, not the parts subtotal: a small negative line is
      // swallowed by the other rows and the sum stays positive, which is
      // exactly how this reaches a customer unnoticed.
      await expect(row.getByText(/-\$/)).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await expectRefused(page, /cannot be negative/i)
  })

  test('a job with no title is refused', async ({ page }) => {
    await page.goto(jobUrl)
    const title = page.locator('input[name="title"]')
    await expect(async () => {
      await title.fill('')
      await expect(title).toHaveValue('', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await expectRefused(page, /needs a title/i)
  })

  test('the job is left as it was found, saved and correct', async ({ page }) => {
    await page.goto(jobUrl)
    await expect(totalsRow(page, 'Parts')).toContainText('$1,100.00')
    await expect(totalsRow(page, 'Labor')).toContainText('$2,700.00')
  })
})
