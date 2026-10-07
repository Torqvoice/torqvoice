import { expect, type Page, test } from '@playwright/test'
import { partQuantity, stockMovements } from '../../support/db'
import { settle } from '../../support/hydration'
import { addQuoteLabor, addQuotePart, newQuote, saveQuote } from '../../support/quote'
import {
  archiveInventoryPart,
  chooseExistingOrder,
  existingOrderRadio,
  newOrderRadio,
  openConvertDialog,
  type PlantedVehicle,
  plantInventoryPart,
  plantVehicle,
  quoteNumberOf,
} from '../../support/quote-conversion'
import {
  addLabor,
  addPart,
  jobIdOf,
  laborRowOf,
  laborRows,
  newWorkOrder,
  partRowOf,
  partRows,
  saveWorkOrder,
  totalsRow,
} from '../../support/work-order'

/**
 * A quote added to a work order the car already has open.
 *
 * Diagnostics usually come first: by the time the customer accepts the quote
 * the car is already on a job, and converting it the old way raised a second
 * job and split one visit across two invoices. The convert dialog now offers
 * the vehicle's open jobs. What the quote puts on the job has to be what the
 * customer accepted (its included lines, not the ones left out of the total),
 * appended after what the job already said, which stays exactly as it was;
 * stock moves once, and the job and the quote point at each other.
 *
 * Each describe gets a vehicle of its own, written straight into the
 * database. The seeded Camry has open jobs of the seed's and of other specs,
 * and `/service/new` hands back any untouched draft on the same car younger
 * than five seconds, which another spec running beside this one could own.
 *
 * The quote and the job are left on the workshop's tax with no discount and
 * no warranty of their own, so the dialog has no conflict to ask about; that
 * prompt is another spec's.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

/** What the dialog lists a job as: its number and title, unless the title has the number. */
function targetLabel(invoiceNumber: string, title: string): string {
  return title.includes(invoiceNumber) ? title : `${invoiceNumber} · ${title}`
}

interface PartLine {
  name: string
  quantity: number
  unitPrice: number
}

interface LaborLine {
  description: string
  hours: number
  rate: number
}

/** Every part line on the open work order: name, quantity and unit price. */
async function jobParts(page: Page): Promise<PartLine[]> {
  const rows = partRows(page)
  const lines: PartLine[] = []
  for (let i = 0; i < (await rows.count()); i++) {
    const numbers = partRowOf(rows.nth(i)).locator('input[type="number"]')
    lines.push({
      name: await rows.nth(i).inputValue(),
      quantity: Number(await numbers.nth(0).inputValue()),
      // Quantity, cost, markup, unit price, in the order the editor prints them.
      unitPrice: Number(await numbers.nth(3).inputValue()),
    })
  }
  return lines
}

/** Every labour line on the open work order: description, hours and rate. */
async function jobLabor(page: Page): Promise<LaborLine[]> {
  const rows = laborRows(page)
  const lines: LaborLine[] = []
  for (let i = 0; i < (await rows.count()); i++) {
    const numbers = laborRowOf(rows.nth(i)).locator('input[type="number"]')
    lines.push({
      description: await rows.nth(i).inputValue(),
      hours: Number(await numbers.nth(0).inputValue()),
      rate: Number(await numbers.nth(1).inputValue()),
    })
  }
  return lines
}

/**
 * The quote's last part row, for its exclude switch and its numbers. The
 * quote editor appends, and its number inputs carry no placeholders, so the
 * row is the nearest ancestor holding one.
 */
function lastQuotePartRow(page: Page) {
  return page
    .getByPlaceholder('Name *')
    .last()
    .locator('xpath=ancestor::div[.//input[@type="number"]][1]')
}

test.describe('a quote added to the open work order', () => {
  // The job as it was written up before the quote: two units of a part and an hour.
  const JOB_TITLE = `E2E open job ${stamp}`
  const JOB_PART: PartLine = { name: `E2E job brake fluid ${stamp}`, quantity: 2, unitPrice: 150 }
  const JOB_LABOR: LaborLine = { description: `E2E job diagnosis ${stamp}`, hours: 1, rate: 400 }

  // What the quote prices, and a line the customer left out of the total.
  const QUOTE_TITLE = `E2E add to job quote ${stamp}`
  const QUOTE_PART: PartLine = { name: `E2E quote pads ${stamp}`, quantity: 1, unitPrice: 275 }
  const QUOTE_LABOR: LaborLine = {
    description: `E2E quote fit pads ${stamp}`,
    hours: 1.5,
    rate: 600,
  }
  const EXCLUDED_PART: PartLine = {
    name: `E2E quote left out ${stamp}`,
    quantity: 1,
    unitPrice: 999,
  }

  let vehicle: PlantedVehicle
  let jobUrl = ''
  let invoiceNumber = ''
  let quoteUrl = ''

  test.beforeAll(async () => {
    vehicle = await plantVehicle(`AddToJob${stamp}`)
  })

  test('the job is written up and the quote priced, one line left out', async ({ page }) => {
    jobUrl = await newWorkOrder(page, `/vehicles/${vehicle.id}`, JOB_TITLE)
    await addPart(page, JOB_PART)
    await addLabor(page, JOB_LABOR)
    await saveWorkOrder(page)
    await expect(totalsRow(page, 'Subtotal')).toContainText('$700.00')
    invoiceNumber = await page.getByLabel('Invoice Number').inputValue()
    expect(invoiceNumber).not.toBe('')

    quoteUrl = await newQuote(page, QUOTE_TITLE, vehicle.model)
    await addQuotePart(page, QUOTE_PART)
    await addQuoteLabor(page, {
      description: QUOTE_LABOR.description,
      hours: QUOTE_LABOR.hours,
      rate: QUOTE_LABOR.rate,
    })
    await addQuotePart(page, EXCLUDED_PART)
    // The per-line switch at the end of the row: struck through, out of the total.
    const exclude = lastQuotePartRow(page).getByRole('checkbox', {
      name: 'Exclude from total',
    })
    await exclude.check()
    await expect(exclude).toBeChecked()
    await saveQuote(page)

    // Read back after a reload: the switch is what the conversion reads.
    await page.reload()
    await settle(page)
    await expect(page.getByPlaceholder('Name *').last()).toHaveValue(EXCLUDED_PART.name)
    await expect(
      lastQuotePartRow(page).getByRole('checkbox', { name: 'Exclude from total' })
    ).toBeChecked()
  })

  test('the dialog offers the open job and adds the quote to it', async ({ page }) => {
    await page.goto(quoteUrl)
    const dialog = await openConvertDialog(page)

    await expect(newOrderRadio(dialog)).toBeChecked()
    const confirm = await chooseExistingOrder(page, dialog, targetLabel(invoiceNumber, JOB_TITLE))

    // Enabled only once the dialog has finished comparing the two, so the
    // check for a conflict box below is made after that answer is in.
    await expect(confirm).toBeEnabled({ timeout: 15_000 })
    // Same tax, no discount, no warranty: nothing for the workshop to decide.
    // If this box appears the fixture has drifted from the job, not the app.
    await expect(dialog.getByText('Before adding, decide what the work order keeps')).toHaveCount(0)
    await expect(dialog.getByRole('button', { name: 'Convert', exact: true })).toHaveCount(0)
    await confirm.click()

    // The same job, not a new one.
    await page.waitForURL(jobUrl, { timeout: 60_000 })
    await settle(page)
    await expect(page.getByLabel('Invoice Number')).toHaveValue(invoiceNumber)
  })

  test("the job carries the quote's included lines and the totals add up", async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    // Two parts and two labour lines: the left-out part stayed on the quote.
    await expect(partRows(page)).toHaveCount(2)
    await expect(laborRows(page)).toHaveCount(2)

    const parts = await jobParts(page)
    expect(parts).toContainEqual(QUOTE_PART)
    expect(parts.map((p) => p.name)).not.toContain(EXCLUDED_PART.name)
    const labor = await jobLabor(page)
    expect(labor).toContainEqual(QUOTE_LABOR)

    // 300 + 400 from the job, 275 + 900 from the quote.
    await expect(totalsRow(page, 'Parts')).toContainText('$575.00')
    await expect(totalsRow(page, 'Labor')).toContainText('$1,300.00')
    await expect(totalsRow(page, 'Subtotal')).toContainText('$1,875.00')
  })

  test("the job's own lines are as they were", async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)

    const parts = await jobParts(page)
    const labor = await jobLabor(page)
    // Untouched: one line each, with the name, quantity and price it was saved with.
    expect(parts.filter((p) => p.name === JOB_PART.name)).toEqual([JOB_PART])
    expect(labor.filter((l) => l.description === JOB_LABOR.description)).toEqual([JOB_LABOR])
  })

  test('the job links back to the quote, which reads converted', async ({ page }) => {
    const quoteNumber = await quoteNumberOf(quoteUrl)

    await page.goto(jobUrl)
    await settle(page)
    const link = page.getByTestId('service-from-quote')
    await expect(link).toHaveText(`From quote ${quoteNumber}`)
    await expect(async () => {
      await link.click()
      await page.waitForURL(quoteUrl, { timeout: 5_000 })
    }).toPass({ timeout: 30_000 })
    await settle(page)

    await expect(page.locator('#title')).toHaveValue(QUOTE_TITLE)
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Converted')
    // A quote already on a job cannot be put on one again.
    await expect(
      page.getByRole('button', { name: 'Convert to Work Order', exact: true })
    ).toHaveCount(0)
  })
})

test.describe('a finished job is not offered', () => {
  const JOB_TITLE = `E2E job to finish ${stamp}`
  let vehicle: PlantedVehicle
  let jobUrl = ''
  let invoiceNumber = ''
  let quoteUrl = ''

  /** The status stepper in the work order's header: one button per stage. */
  function stage(page: Page, name: string) {
    return page.getByTestId('status-stepper').getByRole('button', { name: new RegExp(name) })
  }

  test.beforeAll(async () => {
    vehicle = await plantVehicle(`Finished${stamp}`)
  })

  test('while the job is open it is offered', async ({ page }) => {
    jobUrl = await newWorkOrder(page, `/vehicles/${vehicle.id}`, JOB_TITLE)
    await addPart(page, { name: `E2E finished job part ${stamp}`, quantity: 1, unitPrice: 100 })
    await saveWorkOrder(page)
    invoiceNumber = await page.getByLabel('Invoice Number').inputValue()

    quoteUrl = await newQuote(page, `E2E quote after finish ${stamp}`, vehicle.model)
    await addQuotePart(page, { name: `E2E later part ${stamp}`, quantity: 1, unitPrice: 80 })
    await saveQuote(page)

    // The control for the test below: this car's one job is listed while open.
    const dialog = await openConvertDialog(page)
    await chooseExistingOrder(page, dialog, targetLabel(invoiceNumber, JOB_TITLE))
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(dialog).toBeHidden()
  })

  test('once completed, the vehicle has no open work orders to add to', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    await expect(async () => {
      await stage(page, 'Completed').click()
      await expect(stage(page, 'Completed')).toHaveAttribute('aria-current', 'step', {
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })
    await saveWorkOrder(page)
    await page.reload()
    await settle(page)
    await expect(stage(page, 'Completed')).toHaveAttribute('aria-current', 'step')

    await page.goto(quoteUrl)
    const dialog = await openConvertDialog(page)
    await expect(dialog.getByText('This vehicle has no open work orders.')).toBeVisible({
      timeout: 15_000,
    })
    await expect(existingOrderRadio(dialog)).toBeDisabled()
    await expect(newOrderRadio(dialog)).toBeChecked()
    // Only the vehicle picker: no list of jobs to choose from.
    await expect(dialog.getByRole('combobox')).toHaveCount(1)
    await expect(dialog.getByRole('button', { name: 'Convert', exact: true })).toBeEnabled()
    await expect(dialog.getByRole('button', { name: 'Add to work order' })).toHaveCount(0)
  })
})

test.describe('a stocked part on the quote', () => {
  const PART_NAME = `E2E quote stock part ${stamp}`
  // Below ten on hand on purpose: `stockedPart` in support/db.ts picks a part
  // with ten or more, so the inventory spec never takes this one.
  const OPENING = 5
  const JOB_TITLE = `E2E stock job ${stamp}`
  let vehicle: PlantedVehicle
  let partId = ''
  let jobUrl = ''
  let invoiceNumber = ''
  let quoteUrl = ''

  test.beforeAll(async () => {
    vehicle = await plantVehicle(`StockJob${stamp}`)
    partId = await plantInventoryPart({
      name: PART_NAME,
      quantity: OPENING,
      unitCost: 100,
      sellPrice: 250,
    })
  })

  test.afterAll(async () => {
    if (partId) await archiveInventoryPart(partId)
  })

  test('leaves the shelf once when the quote is added to the job', async ({ page }) => {
    jobUrl = await newWorkOrder(page, `/vehicles/${vehicle.id}`, JOB_TITLE)
    await addLabor(page, { description: `E2E stock job check ${stamp}`, hours: 1, rate: 300 })
    await saveWorkOrder(page)
    invoiceNumber = await page.getByLabel('Invoice Number').inputValue()

    quoteUrl = await newQuote(page, `E2E stock quote ${stamp}`, vehicle.model)
    await settle(page)

    // The picker is the only way a quote line carries the stock link.
    const rows = page.getByPlaceholder('Name *')
    const before = await rows.count()
    const picker = page.getByRole('dialog', { name: 'Select Part from Inventory' })
    await expect(async () => {
      await page.getByRole('button', { name: 'From stock', exact: true }).click()
      await expect(picker).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await picker.getByPlaceholder('Search inventory...').fill(PART_NAME)
    await picker
      .getByRole('button', { name: new RegExp(PART_NAME) })
      .first()
      .click()
    await expect(rows).toHaveCount(before + 1)
    await expect(rows.last()).toHaveValue(PART_NAME)
    await lastQuotePartRow(page).locator('input[type="number"]').nth(0).fill('2')
    await saveQuote(page)

    // An estimate moves nothing.
    expect(await partQuantity(partId), 'a quote moves no stock').toBe(OPENING)

    await page.reload()
    const dialog = await openConvertDialog(page)
    const confirm = await chooseExistingOrder(page, dialog, targetLabel(invoiceNumber, JOB_TITLE))
    await expect(confirm).toBeEnabled({ timeout: 15_000 })
    await confirm.click()
    await page.waitForURL(jobUrl, { timeout: 60_000 })
    await settle(page)

    const parts = await jobParts(page)
    expect(parts).toContainEqual({ name: PART_NAME, quantity: 2, unitPrice: 250 })

    expect(await partQuantity(partId)).toBe(OPENING - 2)
    const ledger = await stockMovements(partId, jobIdOf(jobUrl))
    expect(ledger).toHaveLength(1)
    expect(ledger[0].delta).toBe(-2)
    expect(ledger[0].quantityAfter, 'the ledger agrees with the count').toBe(OPENING - 2)
    expect(ledger[0].reason).toBe('quote_conversion')
  })

  test('and not again when the job is saved afterwards', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    await saveWorkOrder(page)

    expect(await partQuantity(partId)).toBe(OPENING - 2)
    expect(await stockMovements(partId, jobIdOf(jobUrl))).toHaveLength(1)
  })
})
