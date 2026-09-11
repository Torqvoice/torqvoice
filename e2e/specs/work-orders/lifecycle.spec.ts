import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  addLabor,
  addPart,
  laborRows,
  newWorkOrder,
  partRowOf,
  partRows,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
  totalsRow,
} from '../../support/work-order'

/**
 * A job from the moment it is written up to the moment it is finished: parts
 * and labour added, priced, corrected, a line removed, the status walked
 * through to completed, and the customer's copy checked at the end.
 *
 * This is the path every workshop walks several times a day, so it is a
 * single serial story rather than independent tests: each step edits the job
 * the step before it left.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const TITLE = `E2E lifecycle ${stamp}`
const PART = `E2E oil filter ${stamp}`
const SECOND_PART = `E2E air filter ${stamp}`

/** A part name written over three lines, the way a counter hand describes one. */
const MULTILINE_PART = `E2E timing belt kit ${stamp}\nGates K015603XS\nincludes tensioner and idler`
const MULTILINE_LABOR = 'Replace timing belt\nand water pump\nrefill coolant'

let vehicleUrl = ''
let jobUrl = ''

/** The status control in the invoice details panel. */
function statusSelect(page: Page): Locator {
  return page
    .getByText('Status', { exact: true })
    .locator('xpath=ancestor::div[1]')
    .getByRole('combobox')
}

async function setStatus(page: Page, option: string): Promise<void> {
  await expect(async () => {
    await statusSelect(page).click()
    await expect(page.getByRole('option', { name: option, exact: true })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('option', { name: option, exact: true }).click()
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  await page.close()
})

test.describe('a work order from intake to completion', () => {
  test('a job is opened on the vehicle and saved with one part', async ({ page }) => {
    jobUrl = await newWorkOrder(page, vehicleUrl, TITLE)
    await addPart(page, { name: PART, quantity: 2, unitPrice: 120 })
    await saveWorkOrder(page)

    await page.reload()
    await expect(page.locator('input[name="title"]')).toHaveValue(TITLE)
    await expect(totalsRow(page, 'Parts')).toContainText('$240.00')
  })

  test('labour is added and the totals follow', async ({ page }) => {
    await page.goto(jobUrl)
    await addLabor(page, { description: 'Change the oil and filter', hours: 1, rate: 800 })
    await saveWorkOrder(page)

    await expect(totalsRow(page, 'Labor')).toContainText('$800.00')
    await expect(totalsRow(page, 'Subtotal')).toContainText('$1,040.00')
  })

  test('a price is corrected and the totals follow it', async ({ page }) => {
    await page.goto(jobUrl)

    const quantity = partRowOf(partRows(page).first()).locator('input[type="number"]').first()
    await expect(quantity).toHaveValue('2')

    // A field can carry the typed value while React's state is still empty,
    // and the editor saves its state, not the DOM. The totals moving is the
    // only proof the change was taken.
    await expect(async () => {
      await quantity.fill('3')
      await expect(totalsRow(page, 'Parts')).toContainText('$360.00', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)

    await page.reload()
    await expect(totalsRow(page, 'Parts')).toContainText('$360.00')
    await expect(totalsRow(page, 'Subtotal')).toContainText('$1,160.00')
  })

  test('a second part is added and then removed again', async ({ page }) => {
    await page.goto(jobUrl)
    await addPart(page, { name: SECOND_PART, quantity: 1, unitPrice: 90 })
    await saveWorkOrder(page)
    await expect(totalsRow(page, 'Parts')).toContainText('$450.00')

    await page.reload()
    await expect(async () => {
      await partRowOf(partRows(page).first())
        .getByRole('button', { name: 'Delete row', exact: true })
        .click()
      await expect(partRows(page)).toHaveCount(1, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)

    await page.reload()
    await expect(totalsRow(page, 'Parts')).toContainText('$360.00')
    await expect(partRows(page)).toHaveCount(1)
  })

  test('a line written over several lines keeps its shape', async ({ page }) => {
    await page.goto(jobUrl)

    // Both fields are textareas, so a description too long for one line is
    // written the way it reads. What is typed has to survive the save, the
    // reload and the customer's copy.
    await addPart(page, { name: MULTILINE_PART, quantity: 1, unitPrice: 4200 })
    await addLabor(page, { description: MULTILINE_LABOR, hours: 4, rate: 800 })
    await saveWorkOrder(page)

    await page.reload()
    await expect(partRows(page).first()).toHaveValue(MULTILINE_PART)
    await expect(laborRows(page).first()).toHaveValue(MULTILINE_LABOR)
  })

  test('the customer copy prints every line of it', async ({ page }) => {
    await page.goto(jobUrl)
    const url = await shareLink(page)
    await page.goto(url)

    for (const line of [...MULTILINE_PART.split('\n'), ...MULTILINE_LABOR.split('\n')]) {
      await expect(
        page.getByText(line, { exact: false }).filter({ visible: true }).first(),
        `"${line}" on the shared invoice`
      ).toBeVisible()
    }
  })

  test('the status walks through to completed', async ({ page }) => {
    await page.goto(jobUrl)

    await setStatus(page, 'In Progress')
    await saveWorkOrder(page)
    await page.reload()
    await expect(statusSelect(page)).toContainText('In Progress')
    // The badge in the header used to print the stored value beside a select
    // that said it properly, so the same job read "in-progress" and
    // "In Progress" an inch apart.
    await expect(page.getByText('in-progress', { exact: true })).toHaveCount(0)

    await setStatus(page, 'Completed')
    await saveWorkOrder(page)
    await page.reload()
    await expect(statusSelect(page)).toContainText('Completed')
  })

  test('the finished job is on the work orders list with its number', async ({ page }) => {
    const number = await (async () => {
      await page.goto(jobUrl)
      return page.getByLabel('Invoice Number').inputValue()
    })()
    expect(number).not.toBe('')

    // Found through the list's own search, not by scrolling: the list shows
    // twenty jobs a page, and a workshop with a few hundred of them (or a
    // long-lived e2e database) never has today's job on the first one.
    await page.goto(`/work-orders?search=${encodeURIComponent(TITLE)}`)
    // The list draws a card copy for narrow screens beside the table.
    await expect(page.getByText(TITLE).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText(number).filter({ visible: true }).first()).toBeVisible()
  })
})
