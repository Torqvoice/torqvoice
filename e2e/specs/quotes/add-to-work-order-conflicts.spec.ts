import { expect, type Locator, type Page, type Response, test } from '@playwright/test'
import {
  addServiceRecordLines,
  type DocumentFields,
  ownerOrganizationId,
  plantJob,
  plantJobOnVehicle,
  plantQuote,
  quoteConversion,
  type ServiceRecordFields,
  servicePartLines,
  setQuoteFields,
  setServiceRecordFields,
  storedServiceRecord,
  userIdFor,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { expectWarrantyStatement } from '../../support/warranty'
import { partRowOf, partRows, totalsRow } from '../../support/work-order'

/**
 * A quote added to a work order the car already has open, where the two
 * disagree on a standing answer.
 *
 * The lines come across either way. What the dialog cannot decide for the
 * workshop is which discount, tax basis and warranty the job carries
 * afterwards: its own, or the quote's, which is what the customer accepted.
 * So it asks, one question per disagreement, and "Add to work order" waits
 * until every question has an answer. Each answer is followed onto the job's
 * Totals panel or warranty panel, and into what the job stores.
 *
 * Every difference is written straight onto the quote's and the job's own
 * columns. The workshop's tax and warranty settings are shared with specs
 * running beside this one and are never touched. Each test plants its own
 * car, job and quote, so no other job on the car can be offered.
 *
 * The figures: the job has a part at 300 and an hour and a half at 400, 900
 * in all, taxed 25% on top; the quote has one part at 200. Added together the
 * job's lines come to 1,100 before discount and tax.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const stamp = Date.now()
const OWNER = 'demo@torqvoice.com'

let organizationId = ''
let userId = ''

/** The job as it stands before the quote: 900 of lines at 25% on top, nothing else. */
const JOB_BASE: ServiceRecordFields = {
  status: 'in-progress',
  subtotal: 900,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 25,
  taxInclusive: false,
  taxComponents: null,
  taxAmount: 225,
  totalAmount: 1125,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

/** The quote as it stands with nothing to disagree about: 200 at 25% on top. */
const QUOTE_BASE: DocumentFields = {
  subtotal: 200,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  taxRate: 25,
  taxInclusive: false,
  taxComponents: null,
  taxAmount: 50,
  totalAmount: 250,
  warrantyStatus: null,
  warrantyMonths: null,
  warrantyMileage: null,
  warrantyNotes: null,
}

/** A 10% discount on the job: 90 of its 900, so 810 taxed at 25%. */
const JOB_TEN_PERCENT: ServiceRecordFields = {
  discountType: 'percentage',
  discountValue: 10,
  discountAmount: 90,
  taxAmount: 202.5,
  totalAmount: 1012.5,
}

/** A discount of 18 on the quote. `discountAmount` is what the conflict reads. */
const QUOTE_EIGHTEEN_OFF: DocumentFields = {
  discountType: 'fixed',
  discountValue: 18,
  discountAmount: 18,
  taxAmount: 45.5,
  totalAmount: 227.5,
}

/** The quote priced with no tax at all. */
const QUOTE_UNTAXED: DocumentFields = { taxRate: 0, taxAmount: 0, totalAmount: 200 }

/** The quote stating twelve months of the workshop's warranty. */
const QUOTE_TWELVE_MONTHS: DocumentFields = { warrantyStatus: 'included', warrantyMonths: 12 }

interface Scenario {
  jobId: string
  jobTitle: string
  vehicleId: string
  quoteId: string
  quoteUrl: string
  jobPart: string
  quotePart: string
}

/** One car with one open job and one quote for it, differing only as asked. */
async function plantScenario(
  label: string,
  differences: { job?: ServiceRecordFields; quote?: DocumentFields } = {}
): Promise<Scenario> {
  const jobTitle = `E2E conflicts ${label} ${stamp}`
  const { serviceRecordId: jobId, vehicleId } = await plantJob(organizationId, userId, jobTitle)
  const jobPart = `E2E job part ${label} ${stamp}`
  const quotePart = `E2E quote part ${label} ${stamp}`
  await addServiceRecordLines(jobId, {
    parts: [{ name: jobPart, quantity: 1, unitPrice: 300 }],
    labor: [{ description: `E2E job labour ${label}`, hours: 1.5, rate: 400 }],
  })
  await setServiceRecordFields(jobId, { ...JOB_BASE, ...differences.job })

  const quoteId = await plantQuote(organizationId, userId, {
    vehicleId,
    title: `E2E conflicts quote ${label} ${stamp}`,
    parts: [{ name: quotePart, quantity: 1, unitPrice: 200 }],
  })
  await setQuoteFields(quoteId, { ...QUOTE_BASE, ...differences.quote })

  return {
    jobId,
    jobTitle,
    vehicleId,
    quoteId,
    quoteUrl: `/quotes/${quoteId}`,
    jobPart,
    quotePart,
  }
}

/** The server action that asks whether the quote and this job disagree. */
function conflictCheckFor(jobId: string) {
  return (response: Response) => {
    const request = response.request()
    return (
      request.method() === 'POST' &&
      Boolean(request.headers()['next-action']) &&
      (request.postData() ?? '').includes(jobId)
    )
  }
}

function conflictBox(dialog: Locator): Locator {
  return dialog.getByText('Before adding, decide what the work order keeps', { exact: true })
}

function addButton(dialog: Locator): Locator {
  return dialog.getByRole('button', { name: 'Add to work order', exact: true })
}

/**
 * Opens the convert dialog on the quote, picks "Add to an existing work
 * order", and waits for the answer to whether the quote and the job the
 * dialog picked first disagree.
 */
async function openAddToWorkOrder(page: Page, scenario: Scenario, firstJobId = scenario.jobId) {
  await page.goto(scenario.quoteUrl)
  await settle(page)

  const dialog = page.getByRole('dialog', { name: 'Convert Quote to Work Order' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Convert to Work Order', exact: true }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // Enabled once the car's open jobs have been read.
  const existing = dialog.getByRole('radio', { name: 'Add to an existing work order' })
  await expect(existing).toBeEnabled({ timeout: 30_000 })
  const checked = page.waitForResponse(conflictCheckFor(firstJobId), { timeout: 30_000 })
  await existing.check()
  await checked
  await expect(dialog.getByText('Checking the quote against the work order...')).toHaveCount(0)
  return dialog
}

/** Adds the quote and lands on the job it went to. */
async function addAndOpenJob(page: Page, dialog: Locator, jobId: string) {
  const add = addButton(dialog)
  await expect(add).toBeEnabled()
  await add.click()
  await page.waitForURL(new RegExp(`/vehicles/[^/]+/service/${jobId}$`), { timeout: 60_000 })
  await settle(page)
}

async function expectTotals(page: Page, lines: Record<string, string>) {
  for (const [label, figure] of Object.entries(lines)) {
    await expect(totalsRow(page, label), `${label} on the work order`).toContainText(figure)
  }
}

/** The editor row of the part with this name, wherever it sits in the list. */
async function partRowNamed(page: Page, name: string): Promise<Locator> {
  const rows = partRows(page)
  let index = -1
  await expect(async () => {
    const names = await rows.evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value)
    )
    index = names.indexOf(name)
    expect(index, `${name} among ${names.join(', ')}`).toBeGreaterThanOrEqual(0)
  }).toPass({ timeout: 30_000 })
  return partRowOf(rows.nth(index))
}

/** The quote's part is on the job at the unit price it was quoted at, beside the job's own. */
async function expectQuotePartArrived(page: Page, scenario: Scenario) {
  const row = await partRowNamed(page, scenario.quotePart)
  // Quantity, cost, markup, unit price.
  await expect(row.locator('input[type="number"]').nth(3)).toHaveValue('200')
  await partRowNamed(page, scenario.jobPart)

  const lines = await servicePartLines(scenario.jobId)
  expect(lines.map((line) => line.name).sort()).toEqual(
    [scenario.jobPart, scenario.quotePart].sort()
  )
  const carried = lines.find((line) => line.name === scenario.quotePart)
  expect(carried?.unitPrice).toBe(200)
  expect(carried?.total).toBe(200)

  expect(await quoteConversion(scenario.quoteId)).toEqual({
    status: 'converted',
    convertedToId: scenario.jobId,
  })
}

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId(OWNER)
  userId = await userIdFor(OWNER)
})

test.describe('nothing to decide', () => {
  test('a quote that agrees with the job is added without a question', async ({ page }) => {
    const scenario = await plantScenario('agree')
    const dialog = await openAddToWorkOrder(page, scenario)

    await expect(addButton(dialog)).toBeEnabled()
    await expect(conflictBox(dialog)).toHaveCount(0)

    await addAndOpenJob(page, dialog, scenario.jobId)
    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Tax: '$275.00',
      Total: '$1,375.00',
    })
    await expectQuotePartArrived(page, scenario)
  })

  test("a job with a fixed discount takes the quote's on top without asking", async ({ page }) => {
    const scenario = await plantScenario('fixed', {
      job: {
        discountType: 'fixed',
        discountValue: 50,
        discountAmount: 50,
        taxAmount: 212.5,
        totalAmount: 1062.5,
      },
      quote: QUOTE_EIGHTEEN_OFF,
    })
    const dialog = await openAddToWorkOrder(page, scenario)

    await expect(addButton(dialog)).toBeEnabled()
    await expect(conflictBox(dialog)).toHaveCount(0)

    await addAndOpenJob(page, dialog, scenario.jobId)
    // 50 of the job's and 18 of the quote's: 1,100 less 68 is 1,032, taxed 258.
    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Discount: '-$68.00',
      Tax: '$258.00',
      Total: '$1,290.00',
    })
    await expect(totalsRow(page, 'Discount').getByRole('combobox')).toContainText('Fixed')
    await expect(totalsRow(page, 'Discount').locator('input[type="number"]')).toHaveValue('68')
    await expectQuotePartArrived(page, scenario)

    const stored = await storedServiceRecord(scenario.jobId)
    expect(stored).toMatchObject({
      discountType: 'fixed',
      discountValue: 68,
      discountAmount: 68,
      taxAmount: 258,
      totalAmount: 1290,
    })
  })
})

test.describe('a percentage discount on the job and a discount on the quote', () => {
  async function askedAboutDiscount(page: Page, scenario: Scenario) {
    const dialog = await openAddToWorkOrder(page, scenario)
    await expect(conflictBox(dialog)).toBeVisible()
    const question = dialog.getByTestId('convert-conflict-discount')
    await expect(question).toBeVisible()
    await expect(question).toContainText(
      'The work order has a 10% discount, $90.00 as it stands. The quote carries a discount of $18.00.'
    )
    // Only the discount is in question; the tax and the warranty agree.
    await expect(dialog.getByTestId('convert-conflict-tax')).toHaveCount(0)
    await expect(dialog.getByTestId('convert-conflict-warranty')).toHaveCount(0)
    await expect(addButton(dialog)).toBeDisabled()
    return { dialog, question }
  }

  test('combined: the percentage becomes its amount and the quote adds its own', async ({
    page,
  }) => {
    const scenario = await plantScenario('combine', {
      job: JOB_TEN_PERCENT,
      quote: QUOTE_EIGHTEEN_OFF,
    })
    const { dialog, question } = await askedAboutDiscount(page, scenario)

    await question
      .getByRole('radio', {
        name: "Turn the 10% into $90.00 and add the quote's $18.00, $108.00 in all",
      })
      .check()
    await addAndOpenJob(page, dialog, scenario.jobId)

    // A fixed 108: 1,100 less 108 is 992, taxed 248.
    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Discount: '-$108.00',
      Tax: '$248.00',
      Total: '$1,240.00',
    })
    await expect(totalsRow(page, 'Discount').getByRole('combobox')).toContainText('Fixed')
    await expect(totalsRow(page, 'Discount').locator('input[type="number"]')).toHaveValue('108')
    await expectQuotePartArrived(page, scenario)

    expect(await storedServiceRecord(scenario.jobId)).toMatchObject({
      discountType: 'fixed',
      discountValue: 108,
      discountAmount: 108,
      taxAmount: 248,
      totalAmount: 1240,
    })
  })

  test("kept: the job's percentage stays and now covers the quote's lines too", async ({
    page,
  }) => {
    const scenario = await plantScenario('keep-discount', {
      job: JOB_TEN_PERCENT,
      quote: QUOTE_EIGHTEEN_OFF,
    })
    const { dialog, question } = await askedAboutDiscount(page, scenario)

    await question
      .getByRole('radio', { name: "Keep the 10% discount and drop the quote's $18.00" })
      .check()
    await addAndOpenJob(page, dialog, scenario.jobId)

    // 10% of 1,100 is 110: 990 taxed 247.50.
    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Discount: '-$110.00',
      Tax: '$247.50',
      Total: '$1,237.50',
    })
    await expect(totalsRow(page, 'Discount').getByRole('combobox')).toContainText('Percentage')
    await expect(totalsRow(page, 'Discount').locator('input[type="number"]')).toHaveValue('10')
    await expectQuotePartArrived(page, scenario)

    expect(await storedServiceRecord(scenario.jobId)).toMatchObject({
      discountType: 'percentage',
      discountValue: 10,
      discountAmount: 110,
      taxAmount: 247.5,
      totalAmount: 1237.5,
    })
  })
})

test.describe('the job taxed at 25% on top, the quote priced without tax', () => {
  async function askedAboutTax(page: Page, scenario: Scenario) {
    const dialog = await openAddToWorkOrder(page, scenario)
    await expect(conflictBox(dialog)).toBeVisible()
    const question = dialog.getByTestId('convert-conflict-tax')
    await expect(question).toContainText(
      'The work order is priced with 25% tax added on top. The quote was priced with 0% tax added on top.'
    )
    await expect(dialog.getByTestId('convert-conflict-discount')).toHaveCount(0)
    await expect(dialog.getByTestId('convert-conflict-warranty')).toHaveCount(0)
    await expect(addButton(dialog)).toBeDisabled()
    return { dialog, question }
  }

  test("kept: the quote's part comes across at its price and is taxed like the rest", async ({
    page,
  }) => {
    const scenario = await plantScenario('keep-tax', { quote: QUOTE_UNTAXED })
    const { dialog, question } = await askedAboutTax(page, scenario)

    await question
      .getByRole('radio', {
        name: "Keep the work order's tax. The quote's lines come across at the amounts quoted.",
      })
      .check()
    await addAndOpenJob(page, dialog, scenario.jobId)

    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Tax: '$275.00',
      Total: '$1,375.00',
    })
    await expect(totalsRow(page, 'Tax').locator('input[type="number"]')).toHaveValue('25')
    await expectQuotePartArrived(page, scenario)

    expect(await storedServiceRecord(scenario.jobId)).toMatchObject({
      taxRate: 25,
      taxInclusive: false,
      taxAmount: 275,
      totalAmount: 1375,
    })
  })

  test("switched: the whole job is re-totalled at the quote's tax", async ({ page }) => {
    const scenario = await plantScenario('use-tax', { quote: QUOTE_UNTAXED })
    const { dialog, question } = await askedAboutTax(page, scenario)

    await question
      .getByRole('radio', {
        name: "Switch the work order to the quote's tax. Everything on it is re-totalled.",
      })
      .check()
    await addAndOpenJob(page, dialog, scenario.jobId)

    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Tax: '$0.00',
      Total: '$1,100.00',
    })
    await expect(totalsRow(page, 'Tax').locator('input[type="number"]')).toHaveValue('0')
    await expectQuotePartArrived(page, scenario)

    expect(await storedServiceRecord(scenario.jobId)).toMatchObject({
      taxRate: 0,
      taxInclusive: false,
      taxAmount: 0,
      totalAmount: 1100,
    })
  })
})

test.describe('the quote states a warranty the job does not', () => {
  async function askedAboutWarranty(page: Page, scenario: Scenario) {
    const dialog = await openAddToWorkOrder(page, scenario)
    await expect(conflictBox(dialog)).toBeVisible()
    const question = dialog.getByTestId('convert-conflict-warranty')
    await expect(question).toContainText(
      'The work order says nothing about warranty. The quote the customer accepted says warranty included, 12 months.'
    )
    await expect(dialog.getByTestId('convert-conflict-discount')).toHaveCount(0)
    await expect(dialog.getByTestId('convert-conflict-tax')).toHaveCount(0)
    await expect(addButton(dialog)).toBeDisabled()
    return { dialog, question }
  }

  test("the quote's: the job now includes twelve months from its own date", async ({ page }) => {
    const scenario = await plantScenario('use-warranty', { quote: QUOTE_TWELVE_MONTHS })
    const { dialog, question } = await askedAboutWarranty(page, scenario)

    await question
      .getByRole('radio', { name: "Use the quote's warranty, as the customer accepted it" })
      .check()
    await addAndOpenJob(page, dialog, scenario.jobId)

    const panel = await expectWarrantyStatement(page, 'Included')
    await expect(panel.locator('#warrantyMonths')).toHaveValue('12')
    await expect(panel.getByText('Expires', { exact: true })).toBeVisible()
    await expectQuotePartArrived(page, scenario)

    const stored = await storedServiceRecord(scenario.jobId)
    expect(stored).toMatchObject({ warrantyStatus: 'included', warrantyMonths: 12 })
    expect(stored.warrantyExpiresAt).not.toBeNull()
  })

  test("the job's: it still says nothing about warranty", async ({ page }) => {
    const scenario = await plantScenario('keep-warranty', { quote: QUOTE_TWELVE_MONTHS })
    const { dialog, question } = await askedAboutWarranty(page, scenario)

    await question.getByRole('radio', { name: "Keep the work order's warranty" }).check()
    await addAndOpenJob(page, dialog, scenario.jobId)

    await expectWarrantyStatement(page, 'Not stated')
    await expectQuotePartArrived(page, scenario)

    const stored = await storedServiceRecord(scenario.jobId)
    expect(stored).toMatchObject({ warrantyStatus: null, warrantyMonths: null })
    expect(stored.warrantyExpiresAt).toBeNull()
  })
})

test.describe('every question needs an answer', () => {
  test('Add waits for the last answer, and answers belong to the job they were given for', async ({
    page,
  }) => {
    // The job in question disagrees on all three; a second, newer job on the
    // same car agrees with the quote on everything, and the dialog offers the
    // newest first.
    const scenario = await plantScenario('all-three', {
      job: JOB_TEN_PERCENT,
      quote: { ...QUOTE_EIGHTEEN_OFF, ...QUOTE_UNTAXED, ...QUOTE_TWELVE_MONTHS },
    })
    const agreeingTitle = `${scenario.jobTitle} agreeing`
    const { serviceRecordId: agreeingId } = await plantJobOnVehicle(
      organizationId,
      scenario.vehicleId,
      agreeingTitle
    )
    await setServiceRecordFields(agreeingId, {
      ...JOB_BASE,
      subtotal: 0,
      taxRate: 0,
      taxAmount: 0,
      totalAmount: 0,
      warrantyStatus: 'included',
      warrantyMonths: 12,
    })

    const dialog = await openAddToWorkOrder(page, scenario, agreeingId)
    // The vehicle picker comes first; the job picker is the dialog's other combobox.
    const jobPicker = dialog.getByRole('combobox').last()
    await expect(jobPicker).toContainText(agreeingTitle)
    await expect(conflictBox(dialog)).toHaveCount(0)
    await expect(addButton(dialog)).toBeEnabled()

    async function pickJob(title: string, id: string) {
      const checked = page.waitForResponse(conflictCheckFor(id), { timeout: 30_000 })
      await jobPicker.click()
      await page.getByRole('option', { name: title, exact: true }).click()
      await checked
      await expect(jobPicker).toContainText(title)
    }

    const discount = dialog.getByTestId('convert-conflict-discount')
    const tax = dialog.getByTestId('convert-conflict-tax')
    const warranty = dialog.getByTestId('convert-conflict-warranty')
    const combine = discount.getByRole('radio', {
      name: "Turn the 10% into $90.00 and add the quote's $18.00, $108.00 in all",
    })
    const keepTax = tax.getByRole('radio', {
      name: "Keep the work order's tax. The quote's lines come across at the amounts quoted.",
    })
    const quoteWarranty = warranty.getByRole('radio', {
      name: "Use the quote's warranty, as the customer accepted it",
    })

    await pickJob(scenario.jobTitle, scenario.jobId)
    await expect(conflictBox(dialog)).toBeVisible()
    await expect(discount).toBeVisible()
    await expect(tax).toBeVisible()
    await expect(warranty).toBeVisible()
    await expect(addButton(dialog)).toBeDisabled()

    // Two answers of three: still waiting.
    await quoteWarranty.check()
    await expect(addButton(dialog)).toBeDisabled()
    await combine.check()
    await expect(addButton(dialog)).toBeDisabled()

    // Another job is another set of questions; this one has none.
    await pickJob(agreeingTitle, agreeingId)
    await expect(conflictBox(dialog)).toHaveCount(0)
    await expect(addButton(dialog)).toBeEnabled()

    // Back again, the answers given for it are gone: they were about the job
    // as it was read then, and it is read afresh.
    await pickJob(scenario.jobTitle, scenario.jobId)
    await expect(conflictBox(dialog)).toBeVisible()
    for (const question of [discount, tax, warranty]) {
      for (const choice of await question.getByRole('radio').all()) {
        await expect(choice).not.toBeChecked()
      }
    }
    await expect(addButton(dialog)).toBeDisabled()

    // Answered in another order than listed: enabled by the last, whichever it is.
    await keepTax.check()
    await expect(addButton(dialog)).toBeDisabled()
    await quoteWarranty.check()
    await expect(addButton(dialog)).toBeDisabled()
    await combine.check()
    await expect(addButton(dialog)).toBeEnabled()

    // Each answer is applied on its own: a fixed 108, the job's 25%, and the
    // quote's twelve months.
    await addAndOpenJob(page, dialog, scenario.jobId)
    await expectTotals(page, {
      Subtotal: '$1,100.00',
      Discount: '-$108.00',
      Tax: '$248.00',
      Total: '$1,240.00',
    })
    const panel = await expectWarrantyStatement(page, 'Included')
    await expect(panel.locator('#warrantyMonths')).toHaveValue('12')
    await expectQuotePartArrived(page, scenario)

    // The other job was not touched.
    expect(await servicePartLines(agreeingId)).toEqual([])
  })

  test('a job changed after the dialog asked is refused, and nothing moves', async ({ page }) => {
    const scenario = await plantScenario('changed', { quote: QUOTE_EIGHTEEN_OFF })
    const dialog = await openAddToWorkOrder(page, scenario)
    await expect(conflictBox(dialog)).toHaveCount(0)
    await expect(addButton(dialog)).toBeEnabled()

    // Someone gives the job a percentage while the dialog is open: the quote's
    // 18 now needs an answer the dialog never asked for.
    await setServiceRecordFields(scenario.jobId, JOB_TEN_PERCENT)

    await addButton(dialog).click()
    await expect(
      page.getByText('The quote and the work order differ; choose what the work order keeps')
    ).toBeVisible({ timeout: 30_000 })
    expect(page.url()).toContain(scenario.quoteUrl)

    expect(await quoteConversion(scenario.quoteId)).toEqual({
      status: 'draft',
      convertedToId: null,
    })
    expect((await servicePartLines(scenario.jobId)).map((line) => line.name)).toEqual([
      scenario.jobPart,
    ])
    expect(await storedServiceRecord(scenario.jobId)).toMatchObject({
      discountType: 'percentage',
      discountValue: 10,
      totalAmount: 1012.5,
    })
  })
})
