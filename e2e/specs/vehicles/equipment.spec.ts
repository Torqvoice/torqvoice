import { expect, type Page, test } from '@playwright/test'
import { Client } from 'pg'
import { ownerOrganizationId } from '../../support/db'
import { settle } from '../../support/hydration'
import { pdfContent } from '../../support/pdf'
import { addLabor, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * Equipment fitted to a vehicle, with every piece assembled.
 *
 * First the opt-out: a workshop that has defined no kind of equipment has
 * nothing about it on the vehicle or the work order. Then the flow a heavy
 * vehicle workshop runs: kinds of equipment defined and put in order in
 * Settings, a crane added to a truck with its year of manufacture and an
 * examination that is overdue, a meter of its own read on a work order that
 * works on it, the invoice printing none of it until its design asks, and the
 * crane moved to another truck, taking its history along and leaving a line
 * in the first truck's history.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const CRANE = `E2E crane ${stamp}`
const TAIL_LIFT = `E2E tail lift ${stamp}`
const HOURS = `E2E crane hours ${stamp}`
const SERIAL = `SN-${stamp}`
let vehicleUrl = ''
let otherVehicleUrl = ''
let jobUrl = ''

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

/** Every type, item and meter this spec made (items before their types, which refuse to go first). */
async function leaveNoTrace(): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb(async (db) => {
    await db.query(
      `delete from equipment_items where "organizationId" = $1 and "typeId" in
        (select id from equipment_types where "organizationId" = $1 and name like 'E2E %')`,
      [organizationId]
    )
    await db.query(
      `delete from equipment_types where "organizationId" = $1 and name like 'E2E %'`,
      [organizationId]
    )
    await db.query(
      `delete from meter_types where "organizationId" = $1 and name like 'E2E crane hours %'`,
      [organizationId]
    )
  })
}

function equipment(page: Page) {
  return page.getByTestId('vehicle-equipment')
}

async function invoiceText(page: Page): Promise<string> {
  const id = jobUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  return (await pdfContent(await response.body())).flat
}

test.beforeAll(async ({ browser }) => {
  await leaveNoTrace()
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  otherVehicleUrl = await seededVehicleUrl(page, 'Mixer')
  vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E equipment ${stamp}`)
  await addLabor(page, { description: 'Service the crane', hours: 1, rate: 100 })
  await saveWorkOrder(page)
  await page.close()
})

test.afterAll(async () => {
  await leaveNoTrace()
})

test.describe('equipment', () => {
  test('a workshop with no kind of equipment has nothing about it', async ({ page }) => {
    await page.goto(vehicleUrl)
    await settle(page)
    await expect(equipment(page)).toHaveCount(0)
    await page.goto(jobUrl)
    await expect(page.getByTestId('job-facts')).toBeVisible()
    await expect(page.getByTestId('work-on')).toHaveCount(0)
  })

  test('kinds of equipment are defined and put in order in Settings, Custom Fields', async ({
    page,
  }) => {
    await page.goto('/settings/custom-fields')
    await settle(page)
    const manager = page.getByTestId('equipment-types-manager')
    for (const name of [CRANE, TAIL_LIFT]) {
      await manager.locator('#equipment-type-name').fill(name)
      await manager.getByRole('button', { name: 'Add type' }).click()
      await expect(manager.getByText(name, { exact: true })).toBeVisible({ timeout: 30_000 })
    }
    // The tail lift first: every list and document follows this order.
    await manager.getByRole('button', { name: `Move ${TAIL_LIFT} up` }).click()
    await expect(manager.locator('li').filter({ hasText: 'E2E ' }).first()).toContainText(
      TAIL_LIFT,
      { timeout: 30_000 }
    )
    await page.reload()
    await expect(
      page.getByTestId('equipment-types-manager').locator('li').filter({ hasText: 'E2E ' }).first()
    ).toContainText(TAIL_LIFT)

    // A meter for the crane to have.
    const meters = page.getByTestId('meters-manager')
    await meters.locator('#meter-name').fill(HOURS)
    await meters.locator('#meter-unit').fill('hrs')
    await meters.getByRole('button', { name: 'Add meter' }).click()
    await expect(meters.getByText(HOURS, { exact: true })).toBeVisible({ timeout: 30_000 })
  })

  test('a crane is added with its year of manufacture and an overdue examination', async ({
    page,
  }) => {
    await page.goto(vehicleUrl)
    await settle(page)
    await expect(async () => {
      await equipment(page).getByRole('button', { name: 'Add equipment' }).click()
      await expect(page.getByTestId('equipment-dialog')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 30_000 })
    const dialog = page.getByTestId('equipment-dialog')
    await dialog.locator('#equipment-type').click()
    await page.getByRole('option', { name: CRANE, exact: true }).click()
    await dialog.locator('#equipment-make').fill('HIAB')
    await dialog.locator('#equipment-model').fill('X-HiPro 192')
    await dialog.locator('#equipment-serial').fill(SERIAL)
    // The year alone, as the plate gives it.
    await dialog.locator('#equipment-manufacture').fill('2019')
    await dialog.locator('#equipment-next-examination').fill('2020-01-15')
    await dialog.locator('#equipment-next-examination').press('Tab')
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    const row = equipment(page).locator('li', { hasText: CRANE })
    await expect(row).toContainText(`S/N ${SERIAL}`, { timeout: 30_000 })
    await expect(row.getByTestId('equipment-examination')).toContainText('overdue')

    // Its own meter, from its details.
    await row.getByRole('button', { name: /Show details/ }).click()
    const itemMeters = row.getByTestId('equipment-meters')
    await itemMeters.getByRole('button', { name: 'Add meter' }).click()
    const add = page.getByRole('dialog')
    await add.getByRole('radio', { name: HOURS, exact: true }).click()
    await add.locator('#meter-first-reading').fill('812,5')
    await add.getByRole('button', { name: 'Add meter' }).click()
    await expect(add).toBeHidden({ timeout: 30_000 })
    await expect(itemMeters.getByText('812.5 hrs')).toBeVisible({ timeout: 30_000 })
  })

  test('the work order works on it, and reads its meter on its own', async ({ page }) => {
    await page.goto(jobUrl)
    const workOn = page.getByTestId('work-on')
    await expect(workOn).toBeVisible({ timeout: 30_000 })
    await workOn.getByRole('combobox').click()
    await page.getByRole('option', { name: new RegExp(CRANE) }).click()
    await page.keyboard.press('Escape')
    await expect(workOn).toContainText(CRANE, { timeout: 30_000 })

    // The job now reads the crane's meter, named with the crane.
    const box = page.getByTestId('job-meters').getByLabel(new RegExp(HOURS))
    await expect(box).toBeVisible({ timeout: 30_000 })
    await box.fill('820')
    await box.press('Enter')
    await expect(page.getByTestId('job-meter-saved')).toBeVisible({ timeout: 30_000 })
    await expect(async () => {
      await page.reload()
      await expect(page.getByTestId('work-on')).toContainText(CRANE, { timeout: 5_000 })
      await expect(page.getByTestId('job-meters').getByLabel(new RegExp(HOURS))).toHaveValue(
        '820',
        { timeout: 5_000 }
      )
    }).toPass({ timeout: 30_000 })
    await expect(page.getByText('Unsaved changes')).toHaveCount(0)
  })

  test('the invoice prints none of it until its design asks', async ({ page }) => {
    const text = await invoiceText(page)
    expect(text).not.toContain(SERIAL)
    expect(text).not.toContain(CRANE)
  })

  test('moved to another truck, it takes its history and leaves a line behind', async ({
    page,
  }) => {
    await page.goto(vehicleUrl)
    await settle(page)
    const row = equipment(page).locator('li', { hasText: CRANE })
    await row.getByRole('button', { name: /^More for/ }).click()
    await page.getByRole('menuitem', { name: 'Move to another vehicle' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('combobox').click()
    await page.keyboard.type('Mixer')
    await page.getByRole('option', { name: /Mixer/ }).first().click()
    await dialog.getByRole('button', { name: 'Move', exact: true }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    await expect(equipment(page).locator('li', { hasText: CRANE })).toHaveCount(0, {
      timeout: 30_000,
    })
    await equipment(page)
      .getByRole('button', { name: /Earlier equipment/ })
      .click()
    await expect(equipment(page).getByTestId('equipment-history')).toContainText(/Moved to/)

    await page.goto(otherVehicleUrl)
    await settle(page)
    const moved = equipment(page).locator('li', { hasText: CRANE })
    await expect(moved).toBeVisible({ timeout: 30_000 })
    // Its meter went with it, reading what the job read.
    await moved.getByRole('button', { name: /Show details/ }).click()
    await expect(moved.getByTestId('equipment-meters').getByText('820 hrs')).toBeVisible()
  })
})
