import { expect, type Locator, type Page, test } from '@playwright/test'
import { completeOnboarding, signUpWithPassword } from '../../support/cloud'
import {
  connectRegistry,
  customerIdNamed,
  disconnectRegistry,
  organizationIdFor,
  userIdFor,
  workshopSetting,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { pdfContent } from '../../support/pdf'
import { newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * A marine workshop, and the words the app uses for it.
 *
 * Settings → Workshop → Service Type is one choice with a long reach. Picked
 * Marine, the workshop services vessels: a make is a manufacturer, the
 * odometer is engine hours, a VIN is a HIN, a plate is a registration number,
 * and a transmission is an outboard or inboard engine. Each place that is
 * meant to switch is pinned here, and so is the way back, because a workshop
 * that picked Marine by mistake has to get its car words back.
 *
 * A workshop of its own is opened by signing up. The seeded one is shared by
 * the whole run, and a failure halfway would leave every later spec reading
 * about vessels.
 */

// Signing up and onboarding a workshop in a hook takes longer than a test.
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const stamp = Date.now()
const EMAIL = `e2e-marine-${stamp}@example.com`
const STATE = `e2e/.auth/marine-${stamp}.json`
const SERVICE_TYPE = 'workshop.serviceType'
// The model carries the run in letters and digits: the list's search reads an
// all-digit word as a number, and the stamp is too big for one.
const VESSEL = {
  make: 'Boston Whaler',
  model: `Montauk ${stamp.toString(36)}`,
  year: '2021',
  hours: '1234',
}

const SKIPPER = `E2E Skipper ${stamp}`
/** A plate registry (the Dutch RDW): enough for the header to offer a lookup. */
const REGISTRY = 'rdw'

let organizationId = ''
let vesselUrl = ''

test.use({ storageState: STATE })

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await signUpWithPassword(page, {
    name: 'E2E Marine Owner',
    email: EMAIL,
    password: `E2e-pass-${stamp}`,
  })
  await completeOnboarding(page, `E2E Marina ${stamp}`, { sampleData: false })
  await context.storageState({ path: STATE })
  await context.close()

  organizationId = await organizationIdFor(EMAIL)
})

test.afterAll(async () => {
  if (organizationId) await disconnectRegistry(organizationId, REGISTRY)
})

function sidebar(page: Page): Locator {
  return page.locator('[data-sidebar="sidebar"]')
}

function serviceTypeSelect(page: Page): Locator {
  return page.getByRole('combobox').filter({ hasText: /^(Automotive|Marine)$/ })
}

/** Settings → Workshop → Service Type, saved, and checked as stored. */
async function setServiceType(page: Page, type: 'Automotive' | 'Marine'): Promise<void> {
  await page.goto('/settings/workshop')
  await settle(page)
  const select = serviceTypeSelect(page)
  await expect(async () => {
    if ((await select.textContent())?.trim() !== type) {
      await select.click()
      await page.getByRole('option', { name: type, exact: true }).click({ timeout: 2_000 })
    }
    await expect(select).toHaveText(type, { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Save Workshop Settings' }).click()
  await expect(page.getByText('Workshop settings saved')).toBeVisible()
  // The page shows its toast whatever the save returned, so what was stored
  // is what counts.
  await expect
    .poll(() => workshopSetting(organizationId, SERVICE_TYPE), { timeout: 15_000 })
    .toBe(type.toLowerCase())
}

/** The vehicle list's add form, open. */
async function openAddVehicle(page: Page): Promise<Locator> {
  await page.goto('/vehicles')
  await settle(page)
  const dialog = page.getByRole('dialog', { name: 'Add New Vehicle' })
  await expect(async () => {
    await page
      .getByRole('button', { name: 'Add Vehicle' })
      .filter({ visible: true })
      .first()
      .click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

function label(dialog: Locator, field: string): Locator {
  return dialog.locator(`label[for="${field}"]`)
}

/** The select drawn after a label. Its trigger carries no id of its own. */
function selectAfter(dialog: Locator, field: string): Locator {
  return dialog.locator(`label[for="${field}"] ~ [role="combobox"]`)
}

test.describe('a workshop that picks Marine', () => {
  test('starts out as automotive', async ({ page }) => {
    await page.goto('/settings/workshop')
    await settle(page)
    await expect(serviceTypeSelect(page)).toHaveText('Automotive')
    expect(await workshopSetting(organizationId, SERVICE_TYPE), 'nothing stored yet').toBeNull()
    await expect(sidebar(page).getByRole('link', { name: /^Vehicles/ })).toBeVisible()
  })

  test('keeps the choice once saved', async ({ page }) => {
    await setServiceType(page, 'Marine')

    await page.reload()
    await settle(page)
    await expect(serviceTypeSelect(page)).toHaveText('Marine')
  })

  test('lists vessels in the sidebar', async ({ page }) => {
    await page.goto('/vehicles')
    await settle(page)
    await expect(sidebar(page).getByRole('link', { name: /^Vessels/ })).toHaveAttribute(
      'href',
      '/vehicles'
    )
    await expect(sidebar(page).getByRole('link', { name: /^Vehicles/ })).toHaveCount(0)
  })

  test('asks for what a boat has when one is added', async ({ page }) => {
    const dialog = await openAddVehicle(page)

    await expect(label(dialog, 'make')).toHaveText('Manufacturer *')
    await expect(label(dialog, 'mileage')).toHaveText('Engine Hours')
    await expect(label(dialog, 'vin')).toHaveText('HIN')
    await expect(label(dialog, 'licensePlate')).toContainText('Registration Number')
    await expect(label(dialog, 'transmission')).toHaveText('Engine Type')
    await expect(label(dialog, 'engineSize')).toHaveText('Engine')
    // A periodic roadworthiness inspection is a road vehicle's.
    await expect(dialog.locator('#inspectionDueAt')).toHaveCount(0)

    // Two-stroke instead of electric and hybrid.
    await selectAfter(dialog, 'fuelType').click()
    await expect(page.getByRole('option')).toHaveText(['Gasoline', 'Diesel', 'Two-Stroke', 'Other'])
    await page.getByRole('option', { name: 'Two-Stroke' }).click()

    // Outboard or inboard, outboard unless told otherwise.
    const engineType = selectAfter(dialog, 'transmission')
    await expect(engineType).toHaveText('Outboard')
    await engineType.click()
    await expect(page.getByRole('option')).toHaveText(['Outboard', 'Inboard'])
    await page.getByRole('option', { name: 'Inboard' }).click()

    await dialog.locator('#make').fill(VESSEL.make)
    await dialog.locator('#model').fill(VESSEL.model)
    await dialog.locator('#year').fill(VESSEL.year)
    await dialog.locator('#mileage').fill(VESSEL.hours)
    await dialog.locator('#vin').fill(`BWC${stamp}`.slice(0, 12))
    await dialog.locator('#licensePlate').fill('NB-4521-E')
    await dialog.getByRole('button', { name: 'Add New Vehicle' }).click()
    await expect(page.getByText('Vehicle added')).toBeVisible({ timeout: 30_000 })
  })

  test('counts a vessel in engine hours, from its page to its invoice', async ({ page }) => {
    vesselUrl = await seededVehicleUrl(page, VESSEL.model)
    await settle(page)
    await expect(page.getByText('1,234', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('hrs', { exact: true }).first()).toBeVisible()

    const jobUrl = await newWorkOrder(page, vesselUrl, `E2E Vessel service ${stamp}`)
    const hours = page.locator('#mileage')
    await expect(page.locator('label[for="mileage"]')).toHaveText('Engine Hours')
    await hours.fill('1250')
    await saveWorkOrder(page)

    const id = new URL(jobUrl).pathname.split('/').pop()
    const response = await page.request.get(`/api/protected/services/${id}/pdf`)
    expect(response.ok(), 'the invoice PDF is served').toBe(true)
    const pdf = await pdfContent(await response.body())
    expect(pdf.flat).toMatch(/Engine Hours:?\s*1,250 hrs/)
    expect(pdf.flat).not.toContain('Mileage')
    // The vessel's own numbers under a vessel's names.
    expect(pdf.flat).toContain(`HIN: ${`BWC${stamp}`.slice(0, 12)}`)
    expect(pdf.flat).toContain('Registration: NB-4521-E')
    expect(pdf.flat).not.toMatch(/\bVIN:|\bPlate:/)
  })

  test('names vessels in the breadcrumbs', async ({ page }) => {
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })

    await page.goto('/vehicles')
    await settle(page)
    await expect(breadcrumb).toContainText('Vessels')
    await expect(breadcrumb).toContainText('All Vessels')
    await expect(breadcrumb).not.toContainText('Vehicle')

    await page.goto(vesselUrl)
    await settle(page)
    await expect(breadcrumb).toContainText('Vessel Details')
    await expect(breadcrumb).not.toContainText('Vehicle')
  })

  test('names vessels in the bottom bar on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/vehicles')
    await settle(page)

    const vessels = page
      .getByRole('link', { name: 'Vessels', exact: true })
      .filter({ visible: true })
    await expect(vessels).toHaveAttribute('href', '/vehicles')
    await expect(
      page.getByRole('link', { name: 'Vehicles', exact: true }).filter({ visible: true })
    ).toHaveCount(0)
  })

  test('starts a work order on a vessel, with a registration number', async ({ page }) => {
    await page.goto('/work-orders?new=1')
    await settle(page)
    const picker = page.getByRole('dialog', { name: 'Select Vessel for Work Order' })
    await expect(picker).toBeVisible({ timeout: 30_000 })
    await expect(picker.getByPlaceholder('Search vessels...')).toBeVisible()

    await expect(async () => {
      await picker.getByRole('button', { name: 'Add New Vessel' }).first().click()
      await expect(page.locator('#new-make')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    const create = page.getByRole('dialog', { name: 'Add New Vessel' })
    await expect(create.getByText('Manufacturer *', { exact: true })).toBeVisible()
    await expect(create.getByText('Registration Number', { exact: true })).toBeVisible()
    await expect(create.getByText('License Plate', { exact: true })).toHaveCount(0)

    // A vessel and its owner, made in one go, for the customer page below.
    await page.locator('#new-make').fill('Yamaha')
    await page.locator('#new-model').fill(`242X ${stamp.toString(36)}`)
    await page.locator('#new-year').fill('2019')
    await page.getByRole('combobox').filter({ hasText: 'Select a customer (optional)' }).click()
    await page.getByRole('option', { name: 'Create new customer' }).click()
    await page.locator('#new-customer-name').fill(SKIPPER)
    await page.getByRole('button', { name: 'Create & Continue' }).click()
    await page.waitForURL(/\/vehicles\/[^/]+\/service\//, { timeout: 30_000 })
  })

  test("shows a customer's vessels in engine hours", async ({ page }) => {
    await page.goto(`/customers/${await customerIdNamed(organizationId, SKIPPER)}`)
    await settle(page)

    await expect(page.getByText('Engine Hours', { exact: true }).first()).toBeVisible()
    // The list is drawn twice, cards for a phone and a table for a desk, so
    // only the one on screen counts; neither may say km or mi.
    await expect(
      page
        .getByText(/^\d[\d,]* hrs$/)
        .filter({ visible: true })
        .first()
    ).toBeVisible()
    await expect(page.getByText(/^\d[\d,]* (km|mi)$/)).toHaveCount(0)
  })

  test('does not offer a plate lookup, even with a registry connected', async ({ page }) => {
    // Registries answer for road vehicles. Connected, the header would offer
    // one to an automotive workshop; the last test below proves it does.
    await connectRegistry(organizationId, await userIdFor(EMAIL), REGISTRY)

    await page.goto('/vehicles')
    await settle(page)
    await expect(page.getByRole('heading', { name: /./ }).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Plate lookup' })).toHaveCount(0)
  })

  test('gets its car words back when switched to Automotive', async ({ page }) => {
    await setServiceType(page, 'Automotive')

    const dialog = await openAddVehicle(page)
    await expect(label(dialog, 'make')).toHaveText('Make *')
    await expect(label(dialog, 'mileage')).toHaveText('Mileage')
    await expect(label(dialog, 'vin')).toHaveText('VIN')
    await expect(label(dialog, 'licensePlate')).toContainText('License Plate')
    await expect(label(dialog, 'transmission')).toHaveText('Transmission')
    await expect(dialog.locator('#inspectionDueAt')).toBeVisible()

    await selectAfter(dialog, 'fuelType').click()
    await expect(page.getByRole('option')).toHaveText([
      'Gasoline',
      'Diesel',
      'Electric',
      'Hybrid',
      'Other',
    ])
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await expect(sidebar(page).getByRole('link', { name: /^Vehicles/ })).toBeVisible()
    await expect(sidebar(page).getByRole('link', { name: /^Vessels/ })).toHaveCount(0)

    // The same pages, back in car words, and the registry connected earlier is
    // offered again.
    await page.goto('/vehicles')
    await settle(page)
    const breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' })
    await expect(breadcrumb).toContainText('All Vehicles')
    await expect(page.getByRole('button', { name: 'Plate lookup' }).first()).toBeVisible()
  })
})
