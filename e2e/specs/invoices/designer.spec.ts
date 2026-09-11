import { expect, type Page, test } from '@playwright/test'
import {
  type InvoiceDesignState,
  invoiceDesignState,
  restoreInvoiceDesignState,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { type PdfContent, pdfContent } from '../../support/pdf'
import {
  addLabor,
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
} from '../../support/work-order'

/**
 * The invoice designer, and whether what it shows is what gets printed.
 *
 * The spec builder behind it is covered by unit tests, section by section
 * (`src/__tests__/features/invoice-designer/every-block.test.ts`). What no
 * unit test can reach is the chain: a switch clicked in the rail, a design
 * saved, and the document a customer is handed changing to match. Each test
 * here changes one thing in the designer and then reads the invoice.
 *
 * The job is left as a draft on purpose. An issued invoice prints from the
 * snapshot it was frozen with, which is the right behaviour and the wrong
 * fixture: it would ignore every change made here.
 *
 * Saving in the designer writes the workshop's live layout and graduates it
 * from the classic sheet to the designer's, so the state is taken before and
 * put back afterwards — the pricing and parity specs pin figures on that
 * sheet to the cent.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const DESIGN_NAME = `E2E design ${stamp}`

let jobUrl = ''
/** The sheet as the designer draws it before any of these tests touch it. */
let baseline: PdfContent
let restoreTo: InvoiceDesignState

/** Opens the designer on the workshop's current layout, past the gallery. */
async function openDesigner(page: Page) {
  await page.goto('/invoice-designer')
  const carryOn = page.getByRole('button', { name: /continue with my current layout/i })
  const gallery = await carryOn
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (gallery) await carryOn.click()

  // The rail is the designer: sections down the left, one row each.
  await expect(page.getByTestId('rail-header')).toBeVisible({ timeout: 30_000 })
  await settle(page)
}

/**
 * Nudges the designer into having something to save, without moving a line on
 * the sheet: the custom-fields block prints nothing until a workshop defines
 * fields, so its switch is the one switch that cannot change the drawing.
 */
async function nudge(page: Page) {
  const eye = page.getByTestId('rail-eye-general')
  for (const state of ['true', 'false']) {
    await expect(async () => {
      await eye.click()
      await expect(eye).toHaveAttribute('aria-pressed', state, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
  }
}

/** Saves the open design, naming it the first time. */
async function saveDesign(page: Page) {
  // The button reads "Saved" while it is idle and "Save design" once there is
  // something to write, so its name is also the check that there is.
  const button = page.getByRole('button', { name: /save design/i }).first()
  await expect(button, 'the designer has something to save').toBeVisible({ timeout: 30_000 })

  const dialog = page.getByRole('dialog').filter({ hasText: 'Save this design' })
  // A toast, and not the button going quiet: the button says "Saved" when it
  // has done nothing at all.
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

/**
 * Words as the canvas draws them. Like the printed sheet, the canvas keeps a
 * hidden copy of itself for measuring, so an unfiltered locator finds text
 * nothing can see.
 */
function onCanvas(page: Page, text: string | RegExp) {
  return page.getByText(text).filter({ visible: true }).first()
}

/** Selects a section in the rail so the inspector shows its settings. */
async function selectSection(page: Page, id: string) {
  await expect(async () => {
    await page.getByTestId(`rail-${id}`).click()
    await expect(page.getByText('Section settings', { exact: true })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
}

async function invoicePdf(page: Page): Promise<PdfContent> {
  const id = jobUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  return pdfContent(await response.body())
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  restoreTo = await invoiceDesignState()

  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E designer ${stamp}`)
  await addPart(page, { name: `E2E alternator ${stamp}`, quantity: 1, unitPrice: 3_400 })
  await addLabor(page, { description: 'Fit and test the alternator', hours: 2, rate: 800 })
  await saveWorkOrder(page)

  // Saved once with nothing changed, so the baseline is the designer's own
  // sheet: everything after this is measured against the same drawing.
  await openDesigner(page)
  await nudge(page)
  await saveDesign(page)
  baseline = await invoicePdf(page)
  expect(baseline.flat, 'the baseline names the customer').toContain('Mitchell')
  await page.close()
})

test.afterAll(async () => {
  if (restoreTo) await restoreInvoiceDesignState(restoreTo)
})

test.describe('the invoice designer', () => {
  test('opens on the workshop’s own layout, with every section in the rail', async ({ page }) => {
    await openDesigner(page)

    // The rail carries a row per section, hidden ones included.
    for (const id of ['header', 'customer', 'vehicle', 'parts_table', 'totals', 'footer']) {
      await expect(page.getByTestId(`rail-${id}`), `${id} is in the rail`).toBeVisible()
    }
    // And the canvas draws the sheet those rows describe.
    await expect(onCanvas(page, 'Demo Auto Workshop')).toBeVisible()
    await expect(onCanvas(page, 'INVOICE')).toBeVisible()
  })

  test('a section switched off in the rail leaves the printed invoice', async ({ page }) => {
    await openDesigner(page)

    const eye = page.getByTestId('rail-eye-vehicle')
    await expect(eye).toHaveAttribute('aria-pressed', 'true')
    await expect(async () => {
      await eye.click()
      await expect(eye).toHaveAttribute('aria-pressed', 'false', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveDesign(page)

    const pdf = await invoicePdf(page)
    // The vehicle block and everything in it are gone.
    for (const gone of ['VIN:', 'Plate:', 'Toyota Camry']) {
      expect(pdf.flat, `${gone} is off the sheet`).not.toContain(gone)
    }
    // And nothing else went with it.
    expect(pdf.flat).toContain('Mitchell')
    expect(pdf.flat).toContain('$3,400.00')
  })

  test('the switch is remembered when the designer is opened again', async ({ page }) => {
    await openDesigner(page)
    await expect(page.getByTestId('rail-eye-vehicle')).toHaveAttribute('aria-pressed', 'false')
  })

  test('the document prints the name the workshop gives it', async ({ page }) => {
    await openDesigner(page)
    await selectSection(page, 'document_title')

    const title = page.getByTestId('section-title-text')
    await expect(async () => {
      await title.fill('TAX INVOICE')
      await expect(title).toHaveValue('TAX INVOICE', { timeout: 2_000 })
      // The canvas is the proof the change was taken, not the field.
      await expect(onCanvas(page, 'TAX INVOICE')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveDesign(page)

    const pdf = await invoicePdf(page)
    expect(pdf.flat).toContain('TAX INVOICE')
    expect(pdf.text.split('\n').map((line) => line.trim())).not.toContain('INVOICE')
  })

  test('a field switched off takes only its own line with it', async ({ page }) => {
    await openDesigner(page)
    await selectSection(page, 'customer')

    const email = page.getByTestId('field-customer_email')
    await expect(email).toHaveAttribute('aria-checked', 'true')
    await expect(async () => {
      await email.click()
      await expect(email).toHaveAttribute('aria-checked', 'false', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await saveDesign(page)

    const pdf = await invoicePdf(page)
    expect(pdf.flat, 'the address is off the sheet').not.toContain('james.mitchell@gmail.com')
    // The rest of the panel is untouched.
    expect(pdf.flat).toContain('Mitchell')
    expect(pdf.flat).toContain('+1 (555) 201-3344')
  })

  test('every change can be taken back, and the sheet returns to what it was', async ({ page }) => {
    await openDesigner(page)

    const eye = page.getByTestId('rail-eye-vehicle')
    await expect(async () => {
      await eye.click()
      await expect(eye).toHaveAttribute('aria-pressed', 'true', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await selectSection(page, 'document_title')
    const title = page.getByTestId('section-title-text')
    await expect(async () => {
      await title.fill('')
      await expect(onCanvas(page, /^INVOICE$/)).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await selectSection(page, 'customer')
    const email = page.getByTestId('field-customer_email')
    await expect(async () => {
      await email.click()
      await expect(email).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await saveDesign(page)

    // Word for word the sheet the designer drew before any of this.
    expect((await invoicePdf(page)).flat).toBe(baseline.flat)
  })

  test('the saved design is the one the gallery says is in use', async ({ page }) => {
    await page.goto('/invoice-designer')
    await expect(page.getByText('Your designs')).toBeVisible({ timeout: 30_000 })
    const card = page.getByText(DESIGN_NAME).first().locator('xpath=ancestor::*[.//*[text()]][1]')
    await expect(card).toBeVisible()
    await expect(page.getByText('In use').first()).toBeVisible()
  })
})
