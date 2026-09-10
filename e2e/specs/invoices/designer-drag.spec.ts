import { expect, type Locator, type Page, test } from '@playwright/test'
import {
  type InvoiceDesignState,
  invoiceDesignState,
  restoreInvoiceDesignState,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { pdfContent } from '../../support/pdf'
import {
  addLabor,
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
} from '../../support/work-order'

/**
 * Dragging in the designer, and whether anything moves.
 *
 * "I dragged the rows in the payment block and they stayed where they were"
 * is the complaint this file exists to stop, and it is a real one: two blocks
 * once read their field list as a set rather than a running order, so the
 * inspector's drag did nothing at all. Ordering is pinned for every section
 * in `src/__tests__/features/invoice-designer/field-order.test.ts`; what only
 * a browser can show is that the drag itself reaches that list.
 *
 * Four drags, four different mechanisms: the rail reorders sections with
 * HTML5 drag and drop, the inspector reorders fields the same way, and the
 * canvas moves a block with pointer events — either to a place of its own or
 * onto a neighbour to share a row.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const DESIGN_NAME = `E2E drag ${stamp}`

let jobUrl = ''
let restoreTo: InvoiceDesignState

async function openDesigner(page: Page) {
  await page.goto('/invoice-designer')
  const carryOn = page.getByRole('button', { name: /continue with my current layout/i })
  const gallery = await carryOn
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (gallery) await carryOn.click()
  await expect(page.getByTestId('rail-header')).toBeVisible({ timeout: 30_000 })
  await settle(page)
}

async function saveDesign(page: Page) {
  const button = page.getByRole('button', { name: /save design/i }).first()
  await expect(button, 'the designer has something to save').toBeVisible({ timeout: 30_000 })
  const dialog = page.getByRole('dialog').filter({ hasText: 'Save this design' })
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Saved' }).first()
  await expect(async () => {
    await button.click()
    await expect(dialog.or(toast).first()).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByPlaceholder('Design name').fill(DESIGN_NAME)
    await dialog.getByRole('button', { name: /^(save|update) design$/i }).click()
  }
  await expect(toast).toBeVisible({ timeout: 30_000 })
}

async function selectSection(page: Page, id: string) {
  await expect(async () => {
    await page.getByTestId(`rail-${id}`).click()
    await expect(page.getByText('Section settings', { exact: true })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
}

/** A block as the canvas draws it; the canvas keeps a hidden copy for measuring. */
function onSheet(page: Page, id: string): Locator {
  return page.locator(`[data-node-id="${id}"]`).filter({ visible: true }).first()
}

/**
 * A block ready to be dragged: scrolled into view, with its own box and the
 * box of the sheet it sits on. Both are needed because the canvas thinks in
 * points from the corner of a page, and a sheet is 595 points wide however
 * the canvas is zoomed. A long invoice runs onto a second page, and a block
 * down there has to be brought into view or the pointer lands on nothing at
 * all.
 */
async function grab(page: Page, id: string) {
  const block = onSheet(page, id)
  await block.scrollIntoViewIfNeeded()
  const box = await block.boundingBox()
  expect(box, `${id} is on the canvas`).not.toBeNull()
  const sheet = await block.locator('xpath=ancestor::*[@data-sheet][1]').boundingBox()
  expect(sheet, `${id} sits on a sheet`).not.toBeNull()
  return { box: box!, sheet: sheet!, ptToPx: sheet!.width / 595 }
}

/** Where each of these strings lands in the printed invoice. */
async function printedOrder(page: Page, needles: string[]): Promise<number[]> {
  const id = jobUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  const pdf = await pdfContent(await response.body())
  return needles.map((needle) => {
    const at = pdf.flat.indexOf(needle)
    expect(at, `"${needle}" is on the sheet`).toBeGreaterThanOrEqual(0)
    return at
  })
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  restoreTo = await invoiceDesignState()

  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E drag ${stamp}`)
  await addPart(page, { name: `E2E starter motor ${stamp}`, quantity: 1, unitPrice: 2_100 })
  await addLabor(page, { description: 'Fit the starter motor', hours: 1.5, rate: 800 })
  await saveWorkOrder(page)
  await page.close()
})

test.afterAll(async () => {
  if (restoreTo) await restoreInvoiceDesignState(restoreTo)
})

test.describe('dragging in the designer', () => {
  test('a row dragged in the inspector moves on the printed sheet', async ({ page }) => {
    // The vehicle block: its rows are the vehicle, the VIN, the plate and the
    // mileage, and this workshop's data fills enough of them to see an order.
    // (The payment block is where this went wrong before; the seeded workshop
    // has no bank details, so that one is pinned in the unit tests instead.)
    await openDesigner(page)
    await selectSection(page, 'vehicle')

    const vin = page.getByTestId('field-row-vin')
    const plate = page.getByTestId('field-row-license_plate')
    await expect(vin).toBeVisible()
    await expect(plate).toBeVisible()

    await expect(async () => {
      await plate.dragTo(vin)
      // The canvas redraws from the same list the sheet prints from, so it is
      // the first place the move shows.
      const drawn = await onSheet(page, 'vehicle').innerText()
      expect(drawn.indexOf('Plate')).toBeLessThan(drawn.indexOf('VIN'))
    }).toPass({ timeout: 30_000 })

    await saveDesign(page)

    const [plateAt, vinAt] = await printedOrder(page, ['Plate:', 'VIN:'])
    expect(plateAt, 'the plate now prints above the VIN').toBeLessThan(vinAt)
  })

  test('a field that always prints in the same place offers no drag', async ({ page }) => {
    // The footer prints its portal line first and its closing note last,
    // whatever the list says. Offering a drag there was worse than not
    // offering one: the row moved under the pointer and the sheet ignored it.
    await openDesigner(page)
    await selectSection(page, 'footer')

    for (const fixed of ['footer_note', 'portal_link', 'logo']) {
      await expect(
        page.getByTestId(`field-row-${fixed}`),
        `${fixed} cannot be dragged`
      ).toHaveAttribute('draggable', 'false')
    }
    // The rest of the footer's details still can be.
    await expect(page.getByTestId('field-row-company_address')).toHaveAttribute('draggable', 'true')

    // And the list does not move when one of them is dragged anyway.
    const order = () =>
      page
        .getByTestId('field-row-footer_note')
        .evaluate((el) =>
          Array.from(el.parentElement?.children ?? []).map(
            (row) => (row as HTMLElement).dataset.testid ?? ''
          )
        )
    const before = await order()
    await page
      .getByTestId('field-row-footer_note')
      .dragTo(page.getByTestId('field-row-company_email'))
    expect(await order(), 'the list is where it was').toEqual(before)
  })

  test('a section dragged in the rail moves with it', async ({ page }) => {
    await openDesigner(page)

    // The payment panel sits below the parts; dropped on the parts table it
    // has to print above it.
    const [paymentBefore, partsBefore] = await printedOrder(page, ['PAYMENT INFORMATION', 'Parts'])
    expect(paymentBefore).toBeGreaterThan(partsBefore)

    await expect(async () => {
      await page.getByTestId('rail-bank_account').dragTo(page.getByTestId('rail-parts_table'))
      const positionOf = (id: string) =>
        page
          .getByTestId(`rail-${id}`)
          .evaluate((el) => Array.from(el.parentElement?.children ?? []).indexOf(el))
      const [payment, parts] = await Promise.all([
        positionOf('bank_account'),
        positionOf('parts_table'),
      ])
      expect(payment, 'the payment panel sits above the parts in the rail').toBeLessThan(parts)
    }).toPass({ timeout: 30_000 })

    await saveDesign(page)

    const [payment, parts] = await printedOrder(page, ['PAYMENT INFORMATION', 'Parts'])
    expect(payment, 'and above them on the sheet').toBeLessThan(parts)
  })

  test('a block dragged across the canvas is left where it was put', async ({ page }) => {
    await openDesigner(page)

    const { box, sheet, ptToPx } = await grab(page, 'totals')

    // Pointer events, not HTML5 drag: the canvas tracks the pointer itself,
    // and ignores a move of less than a few pixels so a click stays a click.
    //
    // Dropped into the margin, clear of the column: inside it, a release
    // means "insert here" or "share this row", and only out here does the
    // block stay where it was put while the flow closes up behind it.
    await expect(async () => {
      await page.mouse.move(box.x + box.width / 2, box.y + 8)
      await page.mouse.down()
      await page.mouse.move(sheet.x + 3 * ptToPx, sheet.y + 300 * ptToPx, { steps: 14 })
      await page.mouse.up()
      // The designer offers the way back, which is how it says a block has
      // been taken out of the flow.
      await expect(page.getByRole('button', { name: /return .* to the flow/i })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    await saveDesign(page)

    // Still printed, and still out of the flow when the designer reopens.
    await printedOrder(page, ['Total'])
    await openDesigner(page)
    await selectSection(page, 'totals')
    await expect(page.getByRole('button', { name: /return .* to the flow/i })).toBeVisible()
  })

  test('and the way back puts it in the flow again', async ({ page }) => {
    await openDesigner(page)
    await selectSection(page, 'totals')

    const back = page.getByRole('button', { name: /return .* to the flow/i })
    await expect(async () => {
      await back.click()
      await expect(back).toBeHidden({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await saveDesign(page)
    await openDesigner(page)
    await selectSection(page, 'totals')
    await expect(page.getByRole('button', { name: /return .* to the flow/i })).toHaveCount(0)
  })

  test('a block dropped onto another shares its row', async ({ page }) => {
    await openDesigner(page)

    // The totals block is full width; dropped onto the payment panel it takes
    // a lane beside it, which the rail marks with the side it took.
    const { box: from } = await grab(page, 'totals')
    const target = await onSheet(page, 'bank_account').boundingBox()
    expect(target, 'the payment panel is on the canvas beside it').not.toBeNull()

    await expect(async () => {
      await page.mouse.move(from.x + from.width / 2, from.y + 8)
      await page.mouse.down()
      await page.mouse.move(target!.x + target!.width - 30, target!.y + target!.height / 2, {
        steps: 14,
      })
      await page.mouse.up()
      // The rail marks the lane it took with its side; the letter is drawn
      // uppercase by the stylesheet and stored lowercase.
      await expect(page.getByTestId('rail-column-totals')).toHaveText(/^[lr]$/, {
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    await saveDesign(page)

    // Still in its lane when the designer is opened again.
    await openDesigner(page)
    await expect(page.getByTestId('rail-column-totals')).toHaveText(/^[lr]$/)
  })
})
