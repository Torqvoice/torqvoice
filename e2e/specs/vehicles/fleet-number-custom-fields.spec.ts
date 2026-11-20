import { expect, type Page, test } from '@playwright/test'
import { Client } from 'pg'
import { ownerOrganizationId } from '../../support/db'
import { settle } from '../../support/hydration'
import { openCustomFieldsTab, setReadyMadeField } from '../../support/settings'
import { seededVehicleUrl } from '../../support/work-order'

/**
 * The vehicle's fleet / unit number and the workshop's own fields on a
 * vehicle, with every piece assembled.
 *
 * Both are opt-in, so the first thing held here is the opt-out: a workshop
 * that asked for neither has no box for either in the vehicle dialog. Then
 * what only breaks once the form, the action, the column and the page are
 * wired together: the number typed in the dialog is on the vehicle after a
 * reload and finds it in the list; a required field of the workshop's own
 * left empty stops the save and says which, under the field and in the
 * message, with the cursor in it; filled in, it is saved and read out on the
 * vehicle. Switched off again, the number is hidden and kept.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const FLEET_NUMBER = `T-${String(stamp).slice(-6)}`
const FIELD_LABEL = `E2E depot ${stamp}`
const FIELD_NAME = `e2e_depot_${stamp}`
const SETTING = 'vehicle.fleetNumberEnabled'

let vehicleUrl = ''
let vehicleId = ''

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

/** Leaves the workshop as the rest of the suite expects it: switch off, no field, no number. */
async function leaveNoTrace(): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb(async (db) => {
    await db.query(`delete from app_settings where "organizationId" = $1 and key = $2`, [
      organizationId,
      SETTING,
    ])
    // Its values go with it by cascade.
    await db.query(
      `delete from custom_field_definitions where "organizationId" = $1 and name like 'e2e_depot_%'`,
      [organizationId]
    )
    if (vehicleId) {
      await db.query(`update vehicles set "fleetNumber" = null where id = $1`, [vehicleId])
    }
  })
}

/** A required text field on vehicles, as Settings, Custom Fields would make it. */
async function defineRequiredVehicleField(): Promise<void> {
  const organizationId = await ownerOrganizationId()
  await withDb(async (db) => {
    await db.query(
      `insert into custom_field_definitions
         (id, name, label, "fieldType", required, "entityType", "sortOrder", "isActive",
          "createdAt", "updatedAt", "userId", "organizationId")
       select $1, $2, $3, 'text', true, 'vehicle', 0, true, now(), now(), m."userId", $4
       from organization_members m where m."organizationId" = $4 limit 1`,
      [`e2e${stamp}`, FIELD_NAME, FIELD_LABEL, organizationId]
    )
  })
}

async function openEditDialog(page: Page) {
  await page.goto(vehicleUrl)
  await settle(page)
  const dialog = page.getByRole('dialog').filter({ hasText: 'Edit Vehicle' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Edit Vehicle' }).first().click()
    await expect(dialog).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  vehicleId = new URL(vehicleUrl).pathname.split('/').pop() ?? ''
  await page.close()
  await leaveNoTrace()
})

test.afterAll(async () => {
  await leaveNoTrace()
})

test.describe('the fleet number and a vehicle’s own fields', () => {
  test('a workshop that asked for neither has no box for either', async ({ page }) => {
    const dialog = await openEditDialog(page)
    await expect(dialog.locator('#fleetNumber')).toHaveCount(0)
    await expect(dialog.getByText('Fleet / unit number')).toHaveCount(0)
    await expect(dialog.getByTestId('custom-fields-vehicle')).toHaveCount(0)
  })

  test('the fleet number is switched on in Settings, Invoice & Quotes, Custom Fields', async ({
    page,
  }) => {
    await openCustomFieldsTab(page)
    await expect(page.locator('#fleetNumberEnabled')).toHaveAttribute('aria-checked', 'false')
    await setReadyMadeField(page, 'fleetNumberEnabled', true)

    await page.reload()
    await expect(page.locator('#fleetNumberEnabled')).toHaveAttribute('aria-checked', 'true')
  })

  test('a number typed in the vehicle dialog is on the vehicle after a reload', async ({
    page,
  }) => {
    const dialog = await openEditDialog(page)
    await dialog.locator('#fleetNumber').fill(FLEET_NUMBER)
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    await page.reload()
    await expect(page.getByText(FLEET_NUMBER).filter({ visible: true }).first()).toBeVisible()
    // And the dialog opens on it again: the read that feeds the form has it.
    const again = await openEditDialog(page)
    await expect(again.locator('#fleetNumber')).toHaveValue(FLEET_NUMBER)
  })

  test('the vehicles list finds the vehicle by its fleet number', async ({ page }) => {
    await page.goto(`/vehicles?search=${encodeURIComponent(FLEET_NUMBER)}`)
    // Lists keep a hidden copy for the other width: the one on screen is asked for.
    await expect(page.getByText(FLEET_NUMBER).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText(/Camry/).filter({ visible: true }).first()).toBeVisible()
  })

  test('a required field of the workshop’s own stops the save and says which', async ({ page }) => {
    await defineRequiredVehicleField()
    const dialog = await openEditDialog(page)
    const fields = dialog.getByTestId('custom-fields-vehicle')
    await expect(fields).toBeVisible({ timeout: 30_000 })
    const box = fields.getByLabel(FIELD_LABEL)
    await expect(box).toHaveValue('')

    await dialog.getByRole('button', { name: 'Save Changes' }).click()

    await expect(fields.getByRole('alert')).toHaveText(`${FIELD_LABEL} is required`)
    await expect(
      page.locator('[data-sonner-toast]').filter({ hasText: `Not saved. Fill in: ${FIELD_LABEL}` })
    ).toBeVisible()
    await expect(box).toBeFocused()
    await expect(dialog).toBeVisible()

    await box.fill('North yard')
    await dialog.getByRole('button', { name: 'Save Changes' }).click()
    await expect(dialog).toBeHidden({ timeout: 30_000 })

    await page.reload()
    await expect(page.getByText(FIELD_LABEL).filter({ visible: true }).first()).toBeVisible()
    await expect(page.getByText('North yard').filter({ visible: true }).first()).toBeVisible()
  })

  test('switched off again, the number is hidden and kept', async ({ page }) => {
    const organizationId = await ownerOrganizationId()
    await withDb((db) =>
      db.query(`delete from app_settings where "organizationId" = $1 and key = $2`, [
        organizationId,
        SETTING,
      ])
    )
    await page.goto(vehicleUrl)
    await settle(page)
    await expect(page.getByText(FLEET_NUMBER)).toHaveCount(0)
    const kept = await withDb((db) =>
      db.query<{ fleetNumber: string | null }>(`select "fleetNumber" from vehicles where id = $1`, [
        vehicleId,
      ])
    )
    expect(kept.rows[0]?.fleetNumber).toBe(FLEET_NUMBER)
  })
})
