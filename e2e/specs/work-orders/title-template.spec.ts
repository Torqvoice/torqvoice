import { expect, type Page, test } from '@playwright/test'
import {
  forgetWorkshopSetting,
  ownerOrganizationId,
  serviceRecordNames,
  vehicleFacts,
  workshopSetting,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * A new work order opens with a title the workshop chose.
 *
 * Every job used to start as "New Service Record" and wait for somebody to
 * type over it. A workshop asked for the title to fill itself in from the
 * job's number, the plate or the customer, so Settings → Workshop now holds a
 * template of tags, resolved on the server the moment the draft is made and
 * its number is known. The unit tests in
 * `src/__tests__/features/vehicles/work-order-title.test.ts` pin the
 * resolution rules; this file proves the chain from the settings page to the
 * title field of a job opened from a vehicle.
 *
 * The seeded workshop has never set a template, so the default applies until
 * this file saves one, and the setting is removed again at the end.
 */

test.describe.configure({ mode: 'serial' })

const KEY = 'workshop.workOrderTitleTemplate'

let organizationId = ''
let vehicleUrl = ''
let vehicleId = ''
let facts: Awaited<ReturnType<typeof vehicleFacts>>

/** Types a template into Settings → Workshop and saves it. */
async function saveTemplate(page: Page, template: string): Promise<void> {
  await page.goto('/settings/workshop')
  await settle(page)
  const field = page.locator('#workOrderTitleTemplate')
  await expect(field).toBeVisible()
  await field.fill(template)
  await page.getByRole('button', { name: 'Save Workshop Settings', exact: true }).click()
  await expect(page.getByText('Workshop settings saved', { exact: true })).toBeVisible()
  await expect.poll(() => workshopSetting(organizationId, KEY)).toBe(template)
}

/** When the last job was opened: `/service/new` reuses an untouched draft younger than five seconds. */
let lastOpenedAt = 0

/** Opens a fresh job on the seeded vehicle and returns what it was called and numbered. */
async function openNewJob(page: Page) {
  const wait = lastOpenedAt + 5_500 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  lastOpenedAt = Date.now()
  await page.goto(`${vehicleUrl}/service/new`)
  await page.waitForURL(/\/vehicles\/[^/]+\/service\/[^/]+$/)
  await settle(page)
  const id = page.url().split('/').pop() ?? ''
  const row = await serviceRecordNames(id)
  return { id, ...row, field: page.locator('input[name="title"]') }
}

test.beforeAll(async ({ browser }) => {
  organizationId = await ownerOrganizationId()
  await forgetWorkshopSetting(organizationId, KEY)
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  vehicleId = vehicleUrl.split('/').pop() ?? ''
  facts = await vehicleFacts(vehicleId)
  expect(facts.licensePlate, 'the seeded vehicle has a plate to print').toBeTruthy()
  expect(facts.customerName, 'and an owner').toBeTruthy()
  await page.close()
})

test.afterAll(async () => {
  await forgetWorkshopSetting(organizationId, KEY)
})

test.describe('the default, before the workshop has chosen anything', () => {
  test('names a new job after its number and the plate', async ({ page }) => {
    const job = await openNewJob(page)
    expect(job.invoiceNumber, 'the job was numbered').toBeTruthy()
    expect(job.title).toBe(`${job.invoiceNumber} - ${facts.licensePlate}`)
    // And that is what the editor shows, ready to be typed over.
    await expect(job.field).toHaveValue(job.title)
  })

  test('is what the settings page offers to edit', async ({ page }) => {
    await page.goto('/settings/workshop')
    await settle(page)
    await expect(page.locator('#workOrderTitleTemplate')).toHaveValue(
      '{order_number} - {license_plate}'
    )
    await expect(page.getByTestId('work-order-title-preview')).toHaveText(
      'Example: 2026-1042 - AB 12345'
    )
  })
})

test.describe('a template the workshop wrote', () => {
  test('is previewed as it is typed, tag by tag', async ({ page }) => {
    await page.goto('/settings/workshop')
    await settle(page)
    const field = page.locator('#workOrderTitleTemplate')
    await field.fill('')
    await page.getByTestId('work-order-title-tag-customer_name').click()
    await page.getByTestId('work-order-title-tag-vehicle').click()
    // Two tags added back to back are kept apart by a space.
    await expect(field).toHaveValue('{customer_name} {vehicle}')
    await expect(page.getByTestId('work-order-title-preview')).toHaveText(
      'Example: Jane Cooper 2021 Toyota Camry'
    )

    // A tag nobody knows is pointed out, and left out of the example.
    await field.fill('{order_number} - {nope}')
    await expect(page.getByTestId('work-order-title-unknown')).toHaveText(
      'Unknown tags are left out: {nope}'
    )
    await expect(page.getByTestId('work-order-title-preview')).toHaveText('Example: 2026-1042')
  })

  test('names every new job with the customer, the car and the number', async ({ page }) => {
    await saveTemplate(page, '{customer_name} · {license_plate} · WO#{order_number}')
    const job = await openNewJob(page)
    expect(job.title).toBe(
      `${facts.customerName} · ${facts.licensePlate} · WO#${job.invoiceNumber}`
    )
    await expect(job.field).toHaveValue(job.title)
  })

  test('leaves out a tag nobody knows, with its separator', async ({ page }) => {
    await saveTemplate(page, '{order_number} - {nope} - {license_plate}')
    const job = await openNewJob(page)
    expect(job.title).toBe(`${job.invoiceNumber} - ${facts.licensePlate}`)
  })

  test('prints the car as year, make and model', async ({ page }) => {
    await saveTemplate(page, '{vehicle} ({order_number})')
    const job = await openNewJob(page)
    expect(job.title).toBe(`${facts.year} ${facts.make} ${facts.model} (${job.invoiceNumber})`)
  })

  test('saved empty brings back the plain name', async ({ page }) => {
    await saveTemplate(page, '')
    const job = await openNewJob(page)
    expect(job.title).toBe('New Service Record')
  })

  test('can still be typed over on the job', async ({ page }) => {
    await saveTemplate(page, '{order_number} - {license_plate}')
    const job = await openNewJob(page)
    await job.field.fill('Brake pads, front')
    await saveWorkOrder(page)
    expect((await serviceRecordNames(job.id)).title).toBe('Brake pads, front')
  })
})
