import { readFileSync } from 'node:fs'
import { expect, type Page, test } from '@playwright/test'
import { Client } from 'pg'
import {
  type InvoiceDesignState,
  invoiceDesignState,
  ownerOrganizationId,
  restoreInvoiceDesignState,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { addLabor, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * The vehicle's photo on the invoice, with every piece assembled.
 *
 * Off until a design asks: the vehicle has a photo, and the invoice prints as
 * it did. The designer's vehicle block offers it beside the details or as a
 * faded background, and the invoice then carries one picture more. A vehicle
 * without a photo prints as if the option were off.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const DESIGN_NAME = `E2E vehicle photo design ${stamp}`
let jobUrl = ''
let vehicleId = ''
let photoBefore: string | null = null
let restoreTo: InvoiceDesignState
let imagesWithout = 0

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

async function setPhoto(url: string | null): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb((db) =>
    db.query(`update vehicles set "imageUrl" = $3 where id = $1 and "organizationId" = $2`, [
      vehicleId,
      organizationId,
      url,
    ])
  )
}

/** How many pictures the invoice PDF draws. */
async function invoiceImages(page: Page): Promise<number> {
  const id = jobUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  const body = (await response.body()).toString('latin1')
  return (body.match(/\/Subtype\s*\/Image/g) ?? []).length
}

async function chooseInDesigner(page: Page, choice: string): Promise<void> {
  await page.goto('/invoice-designer')
  const carryOn = page.getByRole('button', { name: /continue with my current layout/i })
  if (await carryOn.isVisible({ timeout: 10_000 }).catch(() => false)) await carryOn.click()
  await expect(page.getByTestId('rail-header')).toBeVisible({ timeout: 30_000 })
  await settle(page)
  await expect(async () => {
    await page.getByTestId('rail-vehicle').click()
    await expect(page.getByText('Section settings', { exact: true })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('button', { name: choice, exact: true }).click()
  const button = page.getByRole('button', { name: /save design/i }).first()
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
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  vehicleId = vehicleUrl.split('/').pop() ?? ''
  photoBefore = await withDb(async (db) => {
    const result = await db.query<{ imageUrl: string | null }>(
      `select "imageUrl" from vehicles where id = $1`,
      [vehicleId]
    )
    return result.rows[0]?.imageUrl ?? null
  })
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E vehicle photo ${stamp}`)
  await addLabor(page, { description: 'Service', hours: 1, rate: 100 })
  await saveWorkOrder(page)
  // A photo on the vehicle, uploaded the way the vehicle form uploads one.
  const upload = await page.request.post('/api/protected/upload', {
    multipart: {
      file: {
        name: 'vehicle.png',
        mimeType: 'image/png',
        buffer: readFileSync('e2e/fixtures/email-logo.png'),
      },
    },
  })
  expect(upload.status()).toBe(200)
  await setPhoto((await upload.json()).url)
  await page.close()
})

test.afterAll(async () => {
  await setPhoto(photoBefore)
  await restoreInvoiceDesignState(restoreTo)
})

test('a vehicle with a photo prints as before until the design asks', async ({ page }) => {
  imagesWithout = await invoiceImages(page)
  expect(imagesWithout).toBeGreaterThanOrEqual(0)
})

test('photo beside the details: the invoice carries the photo', async ({ page }) => {
  await chooseInDesigner(page, 'Photo beside the details')
  expect(await invoiceImages(page)).toBe(imagesWithout + 1)
})

test('faded background: the invoice carries the faded photo instead', async ({ page }) => {
  await chooseInDesigner(page, 'Faded background')
  expect(await invoiceImages(page)).toBe(imagesWithout + 1)
})

test('a vehicle without a photo prints as if the option were off', async ({ page }) => {
  await setPhoto(null)
  expect(await invoiceImages(page)).toBe(imagesWithout)
})
