import { expect, type Page, test } from '@playwright/test'
import { forgetWorkshopSetting, ownerOrganizationId, workshopSetting } from '../../support/db'
import { settle } from '../../support/hydration'
import { type PdfContent, pdfContent } from '../../support/pdf'
import { addQuotePart, newQuote, quotePdfUrl, quoteShareLink, saveQuote } from '../../support/quote'
import { setWarrantyDefaults } from '../../support/settings'
import { chooseWarrantyStatement, expectWarrantyStatement } from '../../support/warranty'
import { newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * What a customer is told about the workshop's warranty, from the quote they
 * accept to the invoice they pay.
 *
 * A workshop writes its standing answer once (Settings → Warranty). A new
 * quote starts from it, the customer reads it on the public link and in the
 * PDF before accepting, and the work order made from that quote carries the
 * same words onto the invoice. "Not included" is a statement in its own right
 * and travels the same way, with the line that the customer's statutory rights
 * stand whenever the workshop wrote no sentence of its own.
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const stamp = Date.now()
const TERMS = `E2E terms ${stamp}: wear parts are not covered.`
const NO_WARRANTY = `E2E statement ${stamp}: no workshop warranty on customer-supplied parts.`
const PART = `E2E brake disc ${stamp}`

const WARRANTY_KEYS = [
  'warranty.defaultStatus',
  'warranty.defaultMonths',
  'warranty.defaultMileage',
  'warranty.defaultTerms',
  'warranty.notIncludedText',
  'warranty.applyToQuotes',
  'warranty.applyToWorkOrders',
]

let organizationId = ''
/** 'km' or 'mi', whichever the workshop under test measures in. */
let unit = ''
let includedQuoteUrl = ''
let notIncludedQuoteUrl = ''

async function quotePdf(page: Page, quoteUrl: string): Promise<PdfContent> {
  const id = quoteUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/quotes/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  return pdfContent(await response.body())
}

async function invoicePdf(page: Page, workOrderUrl: string): Promise<PdfContent> {
  const id = workOrderUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, {
    timeout: 60_000,
  })
  expect(response.status()).toBe(200)
  return pdfContent(await response.body())
}

/** "12 months / 20,000 km", whatever thousands separator the server prints. */
function period(months: number, thousands: number): RegExp {
  return new RegExp(`Duration: ${months} months / ${thousands}[,.\\s\\u00a0\\u202f]?000 ${unit}`)
}

/** Converts the open quote and lands on the work order made from it. */
async function convertToWorkOrder(page: Page): Promise<string> {
  const convert = page.getByRole('button', { name: 'Convert to Work Order', exact: true })
  const dialog = page.getByRole('dialog', { name: 'Convert Quote to Work Order' })
  await expect(async () => {
    await convert.click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  const confirm = dialog.getByRole('button', { name: 'Convert', exact: true })
  await expect(confirm).toBeEnabled()
  await confirm.click()
  await page.waitForURL(/\/vehicles\/[^/]+\/service\/[^/]+$/, { timeout: 60_000 })
  await settle(page)
  await expect(page.getByPlaceholder('Name *').first()).toHaveValue(PART)
  return page.url()
}

test.beforeAll(async ({ browser }) => {
  organizationId = await ownerOrganizationId()
  unit = (await workshopSetting(organizationId, 'workshop.unitSystem')) === 'metric' ? 'km' : 'mi'

  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setWarrantyDefaults(page, {
    newDocumentsSay: 'Warranty included',
    months: 12,
    distance: 20000,
    terms: TERMS,
    notIncludedText: NO_WARRANTY,
  })
  await page.close()
})

test.afterAll(async () => {
  // Every other quote and invoice in the suite prints without a warranty panel.
  for (const key of WARRANTY_KEYS) await forgetWorkshopSetting(organizationId, key)
})

test.describe('the workshop warranty, from quote to invoice', () => {
  test('the settings page keeps what was saved', async ({ page }) => {
    await page.goto('/settings/warranty')
    await settle(page)
    await expect(
      page.getByRole('radio', { name: 'Warranty included', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#warrantyDefaultMonths')).toHaveValue('12')
    await expect(page.locator('#warrantyDefaultMileage')).toHaveValue('20000')
    await expect(page.locator('#warrantyDefaultTerms')).toHaveValue(TERMS)
    await expect(page.locator('#warrantyNotIncludedText')).toHaveValue(NO_WARRANTY)
    // The distance limit is labelled in the workshop's own unit.
    await expect(page.getByText(`Distance limit (${unit})`, { exact: true })).toBeVisible()
  })

  test("a new quote starts from the workshop's warranty, and prints it", async ({ page }) => {
    includedQuoteUrl = await newQuote(page, `E2E covered quote ${stamp}`)
    await addQuotePart(page, { name: PART, quantity: 1, unitPrice: 500 })
    await saveQuote(page)

    const panel = await expectWarrantyStatement(page, 'Included')
    await expect(panel.locator('#warrantyMonths')).toHaveValue('12')
    await expect(panel.locator('#warrantyMileage')).toHaveValue('20000')
    await expect(panel.locator('#warrantyNotes')).toHaveValue(TERMS)
    // No expiry on a quote: the period starts with the work, which has no date yet.
    await expect(panel.getByText('Expires', { exact: true })).toHaveCount(0)

    // The titles in this file avoid the word, so this is the panel's heading.
    const pdf = await quotePdf(page, includedQuoteUrl)
    expect(pdf.flat).toMatch(/warranty/i)
    expect(pdf.flat).toMatch(period(12, 20))
    expect(pdf.flat).toContain(TERMS)
    expect(pdf.flat).not.toContain('Expires:')
  })

  test('the customer reads the same warranty on the link and in its PDF', async ({ page }) => {
    await page.goto(includedQuoteUrl)
    const shareUrl = await quoteShareLink(page)

    // Signed out, the way a customer opens a link.
    const customer = await page.context().browser()?.newContext()
    const customerPage = await (customer as NonNullable<typeof customer>).newPage()
    await customerPage.goto(shareUrl)
    await expect(
      customerPage.getByText(period(12, 20)).filter({ visible: true }).first()
    ).toBeVisible()
    await expect(customerPage.getByText(TERMS).filter({ visible: true }).first()).toBeVisible()

    // Absolute: a context made by hand has no base URL to resolve against.
    const response = await customerPage.request.get(
      new URL(quotePdfUrl(shareUrl), shareUrl).toString()
    )
    expect(response.status()).toBe(200)
    const shared = await pdfContent(await response.body())
    await customer?.close()

    const downloaded = await quotePdf(page, includedQuoteUrl)
    expect(shared.flat).toBe(downloaded.flat)
  })

  test('a period changed on the quote is the period on the work order and the invoice', async ({
    page,
  }) => {
    await page.goto(includedQuoteUrl)
    await settle(page)
    const panel = await expectWarrantyStatement(page, 'Included')
    await panel.getByRole('button', { name: '6 mo', exact: true }).click()
    await expect(panel.locator('#warrantyMonths')).toHaveValue('6')
    await saveQuote(page)

    const workOrderUrl = await convertToWorkOrder(page)
    const onJob = await expectWarrantyStatement(page, 'Included')
    await expect(onJob.locator('#warrantyMonths')).toHaveValue('6')
    await expect(onJob.locator('#warrantyMileage')).toHaveValue('20000')
    await expect(onJob.locator('#warrantyNotes')).toHaveValue(TERMS)
    // The job has a date, so the period now has an end.
    await expect(onJob.getByText('Expires', { exact: true })).toBeVisible()

    const invoice = await invoicePdf(page, workOrderUrl)
    expect(invoice.flat).toMatch(period(6, 20))
    expect(invoice.flat).toContain(TERMS)
    expect(invoice.flat).toContain('Expires:')
  })

  test('"not included" swaps in the workshop\'s statement and drops the period', async ({
    page,
  }) => {
    notIncludedQuoteUrl = await newQuote(page, `E2E uncovered quote ${stamp}`)
    await addQuotePart(page, { name: PART, quantity: 1, unitPrice: 500 })

    const panel = await chooseWarrantyStatement(page, 'Not included')
    await expect(panel.locator('#warrantyMonths')).toHaveCount(0)
    await expect(panel.locator('#warrantyMileage')).toHaveCount(0)
    // The stock terms gave way to the stock statement; nobody had typed over them.
    await expect(panel.locator('#warrantyNotes')).toHaveValue(NO_WARRANTY)
    await saveQuote(page)

    // Saved, not just on screen.
    await page.reload()
    await settle(page)
    const reloaded = await expectWarrantyStatement(page, 'Not included')
    await expect(reloaded.locator('#warrantyNotes')).toHaveValue(NO_WARRANTY)

    const pdf = await quotePdf(page, notIncludedQuoteUrl)
    expect(pdf.flat).toContain('No workshop warranty is included')
    expect(pdf.flat).toContain(NO_WARRANTY)
    expect(pdf.flat).not.toContain('Duration:')
    expect(pdf.flat).not.toContain(TERMS)
  })

  test('with no sentence of its own, the document says statutory rights stand', async ({
    page,
  }) => {
    await page.goto(notIncludedQuoteUrl)
    await settle(page)
    const panel = await expectWarrantyStatement(page, 'Not included')
    await panel.locator('#warrantyNotes').fill('')
    await saveQuote(page)

    const pdf = await quotePdf(page, notIncludedQuoteUrl)
    expect(pdf.flat).toContain('No workshop warranty is included')
    expect(pdf.flat).toContain('Your statutory rights are not affected.')
    expect(pdf.flat).not.toContain(NO_WARRANTY)
  })

  test('a quote that said "not included" makes a work order that says it too', async ({ page }) => {
    await page.goto(notIncludedQuoteUrl)
    await settle(page)
    const workOrderUrl = await convertToWorkOrder(page)

    // Not the workshop's default of twelve months: the customer accepted "none".
    const onJob = await expectWarrantyStatement(page, 'Not included')
    await expect(onJob.locator('#warrantyMonths')).toHaveCount(0)

    const invoice = await invoicePdf(page, workOrderUrl)
    expect(invoice.flat).toContain('No workshop warranty is included')
    expect(invoice.flat).toContain('Your statutory rights are not affected.')
    expect(invoice.flat).not.toContain('Duration:')
    expect(invoice.flat).not.toContain('Expires:')
  })

  test('a new work order starts from the warranty too, and "not stated" prints nothing', async ({
    page,
  }) => {
    const vehicleUrl = await seededVehicleUrl(page)
    const workOrderUrl = await newWorkOrder(page, vehicleUrl, `E2E covered job ${stamp}`)
    const panel = await expectWarrantyStatement(page, 'Included')
    await expect(panel.locator('#warrantyMonths')).toHaveValue('12')
    await expect(panel.locator('#warrantyNotes')).toHaveValue(TERMS)
    await saveWorkOrder(page)
    expect((await invoicePdf(page, workOrderUrl)).flat).toMatch(period(12, 20))

    const cleared = await chooseWarrantyStatement(page, 'Not stated')
    await expect(cleared.locator('#warrantyNotes')).toHaveCount(0)
    await saveWorkOrder(page)

    await page.reload()
    await settle(page)
    // Folded shut again: a document that says nothing has nothing to show.
    await expectWarrantyStatement(page, 'Not stated')
    const silent = await invoicePdf(page, workOrderUrl)
    expect(silent.flat).not.toMatch(/warranty/i)
    expect(silent.flat).not.toContain(TERMS)
  })

  test('the defaults can be kept off new work orders and still reach new quotes', async ({
    page,
  }) => {
    await setWarrantyDefaults(page, {
      newDocumentsSay: 'Warranty included',
      months: 12,
      distance: 20000,
      terms: TERMS,
      notIncludedText: NO_WARRANTY,
      onWorkOrders: false,
    })

    // `/service/new` hands back an untouched draft younger than five seconds.
    await page.waitForTimeout(5_500)
    const vehicleUrl = await seededVehicleUrl(page)
    await newWorkOrder(page, vehicleUrl, `E2E bare job ${stamp}`)
    const onJob = await expectWarrantyStatement(page, 'Not stated')
    // The texts are still one click away.
    const filled = await chooseWarrantyStatement(page, 'Included')
    await expect(filled.locator('#warrantyMonths')).toHaveValue('12')
    await expect(filled.locator('#warrantyNotes')).toHaveValue(TERMS)
    await expect(onJob).toBeVisible()
    // Saved, so the page is left clean rather than with an autosave pending.
    await saveWorkOrder(page)

    await newQuote(page, `E2E still-covered quote ${stamp}`)
    await expectWarrantyStatement(page, 'Included')
  })
})
