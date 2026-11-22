import { expect, type Page, test } from '@playwright/test'
import { Client } from 'pg'
import { ownerOrganizationId } from '../../support/db'
import { settle } from '../../support/hydration'
import { addMeter, openCustomFieldsTab, setMeterRequired } from '../../support/settings'
import { pdfContent } from '../../support/pdf'
import { addLabor, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * Meters besides the odometer, with every piece assembled.
 *
 * First the opt-out: a workshop that has defined no meter has nothing about
 * meters on the vehicle or the work order. Then the flow a heavy-vehicle
 * workshop runs: a meter defined in Settings, fitted to a vehicle with a
 * first reading in decimals, a lower reading saved with a notice, marked as
 * wrong from the history and no longer counted, a reading taken on a work
 * order that saves on its own and is there after a reload, and the invoice
 * printing it only once the design asks for it. Last, the meter made
 * required in Settings: a job on the vehicle saves and moves along without
 * its reading, is not completed until the reading is typed, and says which
 * meter it waits for.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const METER = `E2E engine hours ${stamp}`
let vehicleUrl = ''
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

/** Every meter this spec made, with each vehicle's meter and readings (they cascade). */
async function leaveNoTrace(): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb((db) =>
    db.query(
      `delete from meter_types where "organizationId" = $1 and name like 'E2E engine hours %'`,
      [organizationId]
    )
  )
}

function meters(page: Page) {
  return page.getByTestId('vehicle-meters')
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
  vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E meters ${stamp}`)
  await addLabor(page, { description: 'Service', hours: 1, rate: 100 })
  await saveWorkOrder(page)
  await page.close()
})

test.afterAll(async () => {
  await leaveNoTrace()
})

test.describe('meters', () => {
  test('a workshop with no meter has nothing about meters', async ({ page }) => {
    await page.goto(vehicleUrl)
    await settle(page)
    await expect(meters(page)).toHaveCount(0)
    await page.goto(jobUrl)
    await expect(page.getByTestId('job-facts')).toBeVisible()
    await expect(page.getByTestId('job-meters')).toHaveCount(0)
  })

  test('a meter is defined in Settings, Custom Fields', async ({ page }) => {
    await openCustomFieldsTab(page)
    await expect(page.getByTestId('meters-manager')).toBeVisible()
    await addMeter(page, { name: METER, unit: 'hrs' })
    // Not required until somebody says so.
    await expect(
      page.getByTestId('meters-manager').getByText('Required', { exact: true })
    ).toHaveCount(0)
  })

  test('is fitted to a vehicle with a first reading in decimals', async ({ page }) => {
    await page.goto(vehicleUrl)
    await settle(page)
    await expect(async () => {
      await meters(page).getByRole('button', { name: 'Add meter' }).click()
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 30_000 })
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('radio', { name: METER, exact: true }).click()
    await dialog.locator('#meter-first-reading').fill('4256,7')
    await dialog.getByRole('button', { name: 'Add meter' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(meters(page).getByText('4,256.7 hrs')).toBeVisible({ timeout: 30_000 })
  })

  test('a lower reading is saved with a notice, then marked as wrong and no longer counts', async ({
    page,
  }) => {
    await page.goto(vehicleUrl)
    await settle(page)
    const row = meters(page).locator('li', { hasText: METER })
    await row.getByRole('button', { name: /more/ }).click()
    await page.getByRole('menuitem', { name: 'Add reading' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#meter-reading').fill('4200')
    await expect(dialog.locator('#meter-reading-lower')).toContainText('4,256.7')
    await dialog.getByRole('button', { name: 'Save reading' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })
    await expect(row.getByText('4,200 hrs')).toBeVisible({ timeout: 30_000 })

    await row.getByRole('button', { name: /more/ }).click()
    await page.getByRole('menuitem', { name: 'History' }).click()
    const history = page.getByRole('dialog')
    await history
      .locator('li', { hasText: '4,200' })
      .getByRole('button', { name: 'Mark as wrong' })
      .click()
    await expect(history.getByText('Wrong', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(
      meters(page).locator('li', { hasText: METER }).getByText('4,256.7 hrs')
    ).toBeVisible({
      timeout: 30_000,
    })
  })

  test('a reading taken on the work order saves on its own and stays', async ({ page }) => {
    await page.goto(jobUrl)
    const box = page.getByTestId('job-meters').getByLabel(METER)
    await expect(box).toBeVisible({ timeout: 30_000 })
    await box.fill('4290.5')
    // It saves as it loses focus, and shows a mark once it has.
    await box.press('Enter')
    await expect(page.getByTestId('job-meter-saved')).toBeVisible({ timeout: 30_000 })
    await expect(async () => {
      await page.reload()
      await expect(page.getByTestId('job-meters').getByLabel(METER)).toHaveValue('4290.5', {
        timeout: 5_000,
      })
    }).toPass({ timeout: 30_000 })
    // Its own save: the page's form has nothing unsaved.
    await expect(page.getByText('Unsaved changes')).toHaveCount(0)
  })

  test('the invoice prints the reading without a visit to the designer', async ({ page }) => {
    // A workshop that defined a meter wants it on its paper: the line is on
    // in every design until one switches it off.
    expect(await invoiceText(page)).toContain(METER)
  })

  test('a meter made required in Settings says so in the list', async ({ page }) => {
    await openCustomFieldsTab(page)
    await setMeterRequired(page, METER, true)
    await expect(
      page.getByTestId('meters-manager').locator('[data-testid^="meter-type-"]', { hasText: METER })
    ).toContainText('Required', { timeout: 30_000 })
  })

  test('a job is saved and moved along without the reading, and not completed until it is typed', async ({
    page,
  }) => {
    const url = await newWorkOrder(page, vehicleUrl, `E2E required meter ${stamp}`)
    await addLabor(page, { description: 'Service', hours: 1, rate: 100 })
    await saveWorkOrder(page)
    const box = page.getByTestId('job-meters').getByRole('textbox', { name: new RegExp(METER) })
    await expect(box).toHaveAttribute('aria-required', 'true')
    await setStage(page, 'In Progress')

    // Completing it is refused, naming the meter, and the box is marked.
    await expect(async () => {
      await stage(page, 'Completed').click()
      await expect(page.getByText(`Not completed. Fill in: ${METER}`)).toBeVisible({
        timeout: 3_000,
      })
    }).toPass({ timeout: 30_000 })
    await expect(box).toHaveAttribute('aria-invalid', 'true')
    await expect(box).toBeFocused()
    await expect(stage(page, 'In Progress')).toHaveAttribute('aria-current', 'step')

    // Typed where the message was read, it completes.
    await box.fill('4310')
    await box.press('Enter')
    await expect(page.getByTestId('job-meter-saved')).toBeVisible({ timeout: 30_000 })
    await setStage(page, 'Completed')
    await page.goto(url)
    await settle(page)
    await expect(stage(page, 'Completed')).toHaveAttribute('aria-current', 'step')
  })
})

/** The status stepper in the page header: one button per stage. */
function stage(page: Page, name: string) {
  return page.getByTestId('status-stepper').getByLabel(new RegExp(name))
}

/** Moves the job to a stage. A click before hydration does nothing, so it is repeated. */
async function setStage(page: Page, name: string): Promise<void> {
  await expect(async () => {
    // Once there, a click would open the stage's menu, or do nothing.
    if ((await stage(page, name).getAttribute('aria-current')) !== 'step') {
      await stage(page, name).click()
    }
    await expect(stage(page, name)).toHaveAttribute('aria-current', 'step', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}
