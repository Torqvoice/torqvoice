import { expect, type Locator, type Page } from '@playwright/test'
import { Client } from 'pg'
import { ownerOrganizationId, userIdFor } from './db'
import { settle } from './hydration'

/**
 * Adding a quote to a work order the vehicle already has open.
 *
 * The fixtures are written straight into the database because they are not
 * what is under test: a vehicle of the spec's own (so no other spec's jobs are
 * on it, and `/service/new` cannot hand back another spec's five-second draft)
 * and a stocked part nobody else counts. Everything the feature does is then
 * driven through the page.
 */

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

export interface PlantedVehicle {
  id: string
  /** Unique across runs, so the quote dialog's vehicle search finds this one only. */
  model: string
}

/** A customer and a vehicle of their own in the seeded workshop, with no jobs on it. */
export async function plantVehicle(model: string): Promise<PlantedVehicle> {
  const organizationId = await ownerOrganizationId()
  const userId = await userIdFor('demo@torqvoice.com')
  return withDb(async (db) => {
    const customer = await db.query<{ id: string }>(
      `insert into customers (id, name, "userId", "organizationId", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, now())
       returning id`,
      [`${model} owner`, userId, organizationId]
    )
    const vehicle = await db.query<{ id: string }>(
      `insert into vehicles (id, make, model, year, "licensePlate", "userId", "organizationId", "customerId", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), 'E2E', $1, 2021, $2, $3, $4, $5, now())
       returning id`,
      [model, `E2E-${model.slice(-6)}`, userId, organizationId, customer.rows[0].id]
    )
    return { id: vehicle.rows[0].id, model }
  })
}

/** The number a quote was given, which is what the job's hero names it by. */
export async function quoteNumberOf(quoteUrl: string): Promise<string> {
  const id = new URL(quoteUrl).pathname.split('/').pop()
  return withDb(async (db) => {
    const result = await db.query<{ quoteNumber: string | null }>(
      `select "quoteNumber" from quotes where id = $1`,
      [id]
    )
    const number = result.rows[0]?.quoteNumber
    if (!number) throw new Error(`quote ${id} has no number`)
    return number
  })
}

/** A stocked part of the spec's own, so no other spec moves its count. */
export async function plantInventoryPart(part: {
  name: string
  quantity: number
  unitCost: number
  sellPrice: number
}): Promise<string> {
  const organizationId = await ownerOrganizationId()
  const userId = await userIdFor('demo@torqvoice.com')
  return withDb(async (db) => {
    const result = await db.query<{ id: string }>(
      `insert into inventory_parts (id, name, quantity, "unitCost", "sellPrice", "userId", "organizationId", "updatedAt")
       values (md5(random()::text || clock_timestamp()::text), $1, $2, $3, $4, $5, $6, now())
       returning id`,
      [part.name, part.quantity, part.unitCost, part.sellPrice, userId, organizationId]
    )
    return result.rows[0].id
  })
}

/** Takes a planted part out of the pickers again, keeping its ledger. */
export async function archiveInventoryPart(id: string): Promise<void> {
  await withDb((db) =>
    db.query(`update inventory_parts set "isArchived" = true where id = $1`, [id])
  )
}

/** The convert dialog, by name: an announcement card is a dialog too. */
export function convertDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Convert Quote to Work Order' })
}

/** Opens the convert dialog on the quote open in the page. */
export async function openConvertDialog(page: Page): Promise<Locator> {
  await settle(page)
  const dialog = convertDialog(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Convert to Work Order', exact: true }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  return dialog
}

/** The two ways the dialog offers, as radios named by their labels. */
export function newOrderRadio(dialog: Locator): Locator {
  return dialog.getByRole('radio', { name: 'Create a new work order' })
}

export function existingOrderRadio(dialog: Locator): Locator {
  return dialog.getByRole('radio', { name: 'Add to an existing work order' })
}

/**
 * The open-job picker. The dialog holds two comboboxes, the vehicle picker
 * first and this one under the "existing" radio, so it is the last.
 */
export function workOrderPicker(dialog: Locator): Locator {
  return dialog.getByRole('combobox').last()
}

/**
 * Chooses "Add to an existing work order" and the job named by its label.
 * Returns the dialog's confirm button, which then reads "Add to work order".
 */
export async function chooseExistingOrder(
  page: Page,
  dialog: Locator,
  label: string
): Promise<Locator> {
  const existing = existingOrderRadio(dialog)
  // Enabled once the vehicle's open jobs have loaded.
  await expect(existing).toBeEnabled({ timeout: 15_000 })
  await existing.check()

  const picker = workOrderPicker(dialog)
  await expect(picker).toBeVisible()
  await expect(async () => {
    await picker.click()
    await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('option', { name: label, exact: true }).click()
  await expect(picker).toHaveText(label)

  return dialog.getByRole('button', { name: 'Add to work order', exact: true })
}
