import { expect, test } from '@playwright/test'
import {
  ownerOrganizationId,
  partQuantity,
  setPartQuantity,
  type StockedPart,
  stockedPart,
  stockMovements,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { addPartFromInventory, setPartQuantityField } from '../../support/inventory'
import { newWorkOrder, partRows, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * A part fitted to a car leaves the shelf exactly once.
 *
 * Stock is the one number in this app that a customer never sees and a
 * workshop counts by hand, so an error in it is discovered weeks later at a
 * stocktake with no way to tell which job caused it. The rules are unit
 * tested (`reconcileStock` computes a net delta per part), but the risk is not
 * in the arithmetic: it is in how often the arithmetic runs. A save that
 * re-applies the whole set decrements twice; a save the editor refuses must
 * decrement nothing at all; and the ledger has to agree with the count,
 * because the count is only the running total of the ledger.
 *
 * Everything is asserted against both: the balance on the part and the rows
 * in `stock_movements`.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

let part: StockedPart
/** What the part had on hand before this file touched it. */
let opening = 0
let jobUrl = ''
let jobId = ''

test.beforeAll(async () => {
  const organizationId = await ownerOrganizationId()
  part = await stockedPart(organizationId)
  opening = part.quantity
})

test.afterAll(async () => {
  // The count is shared with every other spec that prices a part, so it goes
  // back to exactly what it was even if an assertion above stopped early.
  if (part) await setPartQuantity(part.id, opening)
})

test.describe('a stocked part used on a job', () => {
  test('comes off the shelf once when the job is saved', async ({ page }) => {
    const vehicleUrl = await seededVehicleUrl(page)
    jobUrl = await newWorkOrder(page, vehicleUrl, `E2E stock ${stamp}`)
    jobId = jobUrl.split('/').pop() ?? ''

    await addPartFromInventory(page, part.name, 3)
    // Nothing has moved yet: the editor is a draft until it is saved.
    expect(await partQuantity(part.id), 'unsaved edits move no stock').toBe(opening)

    await saveWorkOrder(page)

    expect(await partQuantity(part.id)).toBe(opening - 3)
    const ledger = await stockMovements(part.id, jobId)
    expect(ledger).toHaveLength(1)
    expect(ledger[0].delta).toBe(-3)
    expect(ledger[0].quantityAfter, 'the ledger agrees with the count').toBe(opening - 3)
    expect(ledger[0].reason).toBe('service_record')
  })

  test('does not come off twice when the same job is saved again', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    // A second save of an unchanged job: the same three parts are in the
    // payload, and the shelf must not be asked for three more.
    await saveWorkOrder(page)

    expect(await partQuantity(part.id)).toBe(opening - 3)
    expect(await stockMovements(part.id, jobId), 'no second movement').toHaveLength(1)
  })

  test('moves only the difference when the quantity is corrected', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    // Three became five, so two more leave the shelf, not five.
    await expect(async () => {
      await setPartQuantityField(page, 5)
      await expect(
        partRows(page)
          .first()
          .locator('xpath=ancestor::*[.//input[@placeholder="Cost"]][1]')
          .locator('input[type="number"]')
          .first()
      ).toHaveValue('5', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)

    expect(await partQuantity(part.id)).toBe(opening - 5)
    const ledger = await stockMovements(part.id, jobId)
    expect(ledger).toHaveLength(2)
    expect(ledger[1].delta).toBe(-2)
    expect(ledger[1].quantityAfter).toBe(opening - 5)
  })

  test('goes back on the shelf when the row is removed', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    await expect(async () => {
      await page.getByRole('button', { name: 'Delete row' }).first().click()
      await expect(partRows(page)).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)

    expect(await partQuantity(part.id), 'the shelf is whole again').toBe(opening)
    const ledger = await stockMovements(part.id, jobId)
    expect(ledger).toHaveLength(3)
    expect(ledger[2].delta).toBe(5)
    expect(ledger[2].quantityAfter).toBe(opening)
  })

  test('moves nothing when the save is refused', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    // A priced row with no name is refused, and the refusal has to happen
    // before anything is written: a payload that reached the server with the
    // nameless row dropped used to save the rest and take the stock with it.
    await addPartFromInventory(page, part.name, 2)
    await partRows(page).first().fill('')

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Rows without a part name are not saved.')).toBeVisible()
    await expect(page.getByText('Saved', { exact: true })).toHaveCount(0)

    expect(await partQuantity(part.id), 'a refused save moves no stock').toBe(opening)
    expect(await stockMovements(part.id, jobId)).toHaveLength(3)
  })
})

test.describe('using more than the shop has', () => {
  test('is allowed, and the count says how far it went under', async ({ page }) => {
    // Overselling is real information rather than an error: the part was
    // fitted, the shelf owes it, and clamping at zero would corrupt the count
    // as soon as the row is removed again.
    const vehicleUrl = await seededVehicleUrl(page)
    const oversoldUrl = await newWorkOrder(page, vehicleUrl, `E2E oversell ${stamp}`)
    const oversoldId = oversoldUrl.split('/').pop() ?? ''

    await addPartFromInventory(page, part.name, opening + 2)
    await saveWorkOrder(page)

    expect(await partQuantity(part.id)).toBe(-2)
    const ledger = await stockMovements(part.id, oversoldId)
    expect(ledger[0].quantityAfter).toBe(-2)

    // And the picker says so, in the words the workshop reads: not "in
    // stock", but what it now owes.
    await page.goto(oversoldUrl)
    await settle(page)
    const dialog = page.getByRole('dialog', { name: 'Select Part from Inventory' })
    await expect(async () => {
      await page.getByRole('button', { name: 'From Inventory', exact: true }).click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await dialog.getByPlaceholder('Search inventory...').fill(part.name)
    await expect(dialog.getByText('On backorder (2)')).toBeVisible()
    await page.keyboard.press('Escape')

    // Put it back: the same row removed restocks everything it took.
    await expect(async () => {
      await page.getByRole('button', { name: 'Delete row' }).first().click()
      await expect(partRows(page)).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)
    expect(await partQuantity(part.id)).toBe(opening)
  })
})
