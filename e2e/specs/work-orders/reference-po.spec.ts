import { expect, type Page, test } from '@playwright/test'
import { Client } from 'pg'
import {
  type InvoiceDesignState,
  invoiceDesignState,
  ownerOrganizationId,
  restoreInvoiceDesignState,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { type PdfContent, pdfContent } from '../../support/pdf'
import {
  addLabor,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * The customer's reference / PO, from the switch to the paper.
 *
 * An opt-in field, so the first thing held here is the opt-out: a workshop
 * that has not switched it on has no box for it, and a design made before it
 * existed prints the same invoice with a reference on the job as without.
 * Then the flow a fleet workshop runs every day: the customer is marked "PO
 * required", the invoice is held while the job has no reference and says
 * why, the reference is typed in, the invoice goes out, and the number is on
 * the sheet once the design asks for it. Last, the part that only shows with
 * every piece assembled: a reference typed after the invoice was issued is on
 * the issued invoice at once.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const REFERENCE = `PO-${stamp}`
const LATE_REFERENCE = `PO-LATE-${stamp}`
const DESIGN_NAME = `E2E reference design ${stamp}`
const SETTING = 'documents.customerReferenceEnabled'
const HELD = /needs a reference or PO number on their invoices/

let jobUrl = ''
let customerId = ''
let restoreTo: InvoiceDesignState
let withoutField: PdfContent

async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('E2E_DATABASE_URL is not set. See e2e/README.md.')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** The customer the job's vehicle belongs to, whose invoices will need a PO. */
async function customerOfJob(jobId: string): Promise<string> {
  return withDb(async (db) => {
    const result = await db.query<{ customerId: string }>(
      `select v."customerId" from service_records s join vehicles v on v.id = s."vehicleId" where s.id = $1`,
      [jobId]
    )
    const id = result.rows[0]?.customerId
    if (!id) throw new Error('the seeded vehicle has no customer')
    return id
  })
}

/** Leaves the workshop as the rest of the suite expects it: field off, nobody needing a PO. */
async function switchEverythingOff(): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb(async (db) => {
    await db.query(`delete from app_settings where "organizationId" = $1 and key = $2`, [
      organizationId,
      SETTING,
    ])
    await db.query(`update customers set "poRequired" = false where "organizationId" = $1`, [
      organizationId,
    ])
  })
}

function referenceField(page: Page) {
  return page.locator('#customerReference')
}

async function invoicePdf(page: Page): Promise<PdfContent> {
  const id = jobUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  return pdfContent(await response.body())
}

/** Types the reference and waits until the row has it: the box saves on its own. */
async function typeReference(page: Page, value: string): Promise<void> {
  await referenceField(page).fill(value)
  await referenceField(page).blur()
  await expect(async () => {
    await page.reload()
    await expect(referenceField(page)).toHaveValue(value, { timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
}

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

async function selectCustomerBlock(page: Page) {
  await expect(async () => {
    await page.getByTestId('rail-customer').click()
    await expect(page.getByText('Section settings', { exact: true })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
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

test.beforeAll(async ({ browser }) => {
  restoreTo = await invoiceDesignState()
  await switchEverythingOff()

  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E reference ${stamp}`)
  await addLabor(page, { description: 'Inspect and report', hours: 1, rate: 100 })
  await saveWorkOrder(page)
  customerId = await customerOfJob(jobUrl.split('/').pop() ?? '')
  await page.close()
})

test.afterAll(async () => {
  await switchEverythingOff()
  await restoreInvoiceDesignState(restoreTo)
})

test.describe('the customer reference / PO', () => {
  test('a workshop that has not switched it on sees no trace of it', async ({ page }) => {
    await page.goto(jobUrl)
    await expect(page.getByTestId('job-facts')).toBeVisible()
    await expect(referenceField(page)).toHaveCount(0)
    await expect(page.getByText('Reference / PO')).toHaveCount(0)

    await page.goto(`/customers/${customerId}`)
    await page.getByRole('button', { name: 'Edit Customer' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Edit Customer' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('PO required')).toHaveCount(0)
  })

  test('is switched on in Settings, Workshop', async ({ page }) => {
    await page.goto('/settings/workshop')
    await settle(page)
    const toggle = page.locator('#customerReferenceEnabled')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(async () => {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Save Workshop Settings' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    await page.reload()
    await expect(page.locator('#customerReferenceEnabled')).toHaveAttribute('aria-checked', 'true')
  })

  test('the work order gets the field, and asks for nothing yet', async ({ page }) => {
    await page.goto(jobUrl)
    await expect(referenceField(page)).toBeVisible()
    await expect(referenceField(page)).toHaveValue('')
    // Nobody has said this customer needs one.
    await expect(page.getByTestId('customer-reference-required')).toHaveCount(0)
  })

  test('a customer is marked as PO required', async ({ page }) => {
    await page.goto(`/customers/${customerId}`)
    await settle(page)
    await page.getByRole('button', { name: 'Edit Customer' }).first().click()
    const dialog = page.getByRole('dialog', { name: 'Edit Customer' })
    const toggle = dialog.locator('#poRequired')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(page.getByTestId('po-required-badge')).toBeVisible()

    // Saved, not just shown: the form opens with it on.
    await page.reload()
    await page.getByRole('button', { name: 'Edit Customer' }).first().click()
    await expect(
      page.getByRole('dialog', { name: 'Edit Customer' }).locator('#poRequired')
    ).toHaveAttribute('aria-checked', 'true')
  })

  test('the invoice is held, with the reason, while the job has no reference', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    await expect(page.getByTestId('customer-reference-required')).toBeVisible()

    // Sharing is how an invoice goes out: refused, in words, and no dialog opens.
    await page.getByRole('button', { name: 'Share', exact: true }).click()
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: HELD })).toBeVisible()
    await expect(page.getByRole('dialog', { name: 'Share Invoice' })).toHaveCount(0)

    // Nothing was issued and no link was made behind the refusal.
    const { issued, shared } = await withDb(async (db) => {
      const result = await db.query<{ issued: boolean; shared: boolean }>(
        `select "issuedAt" is not null as issued, "publicToken" is not null as shared from service_records where id = $1`,
        [jobUrl.split('/').pop()]
      )
      return result.rows[0]
    })
    expect(issued).toBe(false)
    expect(shared).toBe(false)
  })

  test('working on the job is never held: it still saves without a reference', async ({ page }) => {
    await page.goto(jobUrl)
    await addLabor(page, { description: 'Second look', hours: 0.5, rate: 100 })
    await saveWorkOrder(page)
  })

  test('typing the reference saves it on its own and lifts the hold', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    await typeReference(page, REFERENCE)
    await expect(page.getByTestId('customer-reference-required')).toHaveCount(0)
    // The box is not part of the work order's own save.
    await expect(page.getByText('Unsaved changes')).toHaveCount(0)
  })

  test('the work order list finds the job by its reference', async ({ page }) => {
    await page.goto(`/work-orders?search=${encodeURIComponent(REFERENCE)}`)
    await expect(page.getByTestId('row-reference').filter({ visible: true }).first()).toHaveText(
      REFERENCE
    )
  })

  test('a design saved with the field off prints no reference', async ({ page }) => {
    // Saved first, so the sheet measured here and the one after the switch
    // come from the same designer layout. A workshop that never saved a design
    // prints the classic letterhead, and its first save changes the header on
    // its own ("Due:" becomes a "Due Date" cell): that is the designer, not
    // this field, and it must not be what the comparison below measures.
    // The designer saves only a change: the switch on and off again is one,
    // and leaves the design as it was.
    await openDesigner(page)
    await selectCustomerBlock(page)
    const toggle = page.getByTestId('field-customer_reference')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    for (const state of ['true', 'false']) {
      await expect(async () => {
        await toggle.click()
        await expect(toggle).toHaveAttribute('aria-checked', state, { timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
    }
    await saveDesign(page)
    await page.goto(jobUrl)
    withoutField = await invoicePdf(page)
    expect(withoutField.pages).toBeGreaterThan(0)
    expect(withoutField.flat, 'the reference is on the job, not on the sheet').not.toContain(
      REFERENCE
    )
    expect(withoutField.flat).not.toContain('Your reference')
  })

  test('the designer offers it in the customer block, off until asked for', async ({ page }) => {
    await openDesigner(page)
    await selectCustomerBlock(page)
    const toggle = page.getByTestId('field-customer_reference')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(async () => {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    // The sample sheet shows what it will print.
    await expect(
      page
        .getByText(/Your reference \/ PO: PO-48213/)
        .filter({ visible: true })
        .first()
    ).toBeVisible()
    await saveDesign(page)
  })

  test('the invoice then prints it, and nothing else on the sheet moves', async ({ page }) => {
    await page.goto(jobUrl)
    const withField = await invoicePdf(page)
    expect(withField.flat).toContain(`Your reference / PO: ${REFERENCE}`)
    // The same sheet with one line more: every word it said before is still there.
    const added = withField.flat.replace(`Your reference / PO: ${REFERENCE}`, '')
    for (const word of withoutField.flat.split(' ').filter((w) => w.length > 3)) {
      expect(added, `the sheet still says "${word}"`).toContain(word)
    }
    expect(withField.pages).toBe(withoutField.pages)
  })

  test('with its reference the invoice goes out, and the customer reads it on the link', async ({
    page,
  }) => {
    await page.goto(jobUrl)
    await settle(page)
    const url = await shareLink(page)
    const [, orgId, token] = new URL(url).pathname.match(/\/share\/invoice\/([^/]+)\/([^/]+)/) ?? []
    expect(token, 'the share link carries a token').toBeTruthy()

    const response = await page.request.get(`/api/public/share/invoice/${orgId}/${token}/pdf`)
    expect(response.status()).toBe(200)
    const shared = await pdfContent(await response.body())
    expect(shared.flat).toContain(`Your reference / PO: ${REFERENCE}`)
  })

  test('a reference typed after the invoice was issued is on the issued invoice at once', async ({
    page,
  }) => {
    await page.goto(jobUrl)
    await settle(page)
    // Issued by the share above; the box is still there to type in.
    await expect(referenceField(page)).toBeEnabled()
    await typeReference(page, LATE_REFERENCE)

    const reissued = await invoicePdf(page)
    expect(reissued.flat).toContain(`Your reference / PO: ${LATE_REFERENCE}`)
    expect(reissued.flat).not.toContain(REFERENCE)
  })

  test('switched off again, it is hidden everywhere and kept', async ({ page }) => {
    await page.goto('/settings/workshop')
    await settle(page)
    const toggle = page.locator('#customerReferenceEnabled')
    await expect(async () => {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Save Workshop Settings' }).click()
    await expect(page.getByText('Settings saved')).toBeVisible()

    await page.goto(jobUrl)
    await expect(page.getByTestId('job-facts')).toBeVisible()
    await expect(referenceField(page)).toHaveCount(0)

    // The design still has the field switched on; the value never reaches it.
    const hidden = await invoicePdf(page)
    expect(hidden.flat).not.toContain(LATE_REFERENCE)
    expect(hidden.flat).not.toContain('Your reference')

    const kept = await withDb(async (db) => {
      const result = await db.query<{ customerReference: string | null }>(
        `select "customerReference" from service_records where id = $1`,
        [jobUrl.split('/').pop()]
      )
      return result.rows[0]?.customerReference
    })
    expect(kept).toBe(LATE_REFERENCE)
  })
})
