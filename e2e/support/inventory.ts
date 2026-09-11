import { expect, type Page } from '@playwright/test'
import { partRows } from './work-order'

/**
 * Adding a stocked part to a work order, through the picker a workshop uses.
 *
 * Typing a name into a part row makes free text, which moves no stock. Only a
 * row that carries the inventory part's id does, and the only way to get one
 * is this dialog.
 */
export async function addPartFromInventory(
  page: Page,
  name: string,
  quantity: number
): Promise<void> {
  const rows = partRows(page)
  const before = await rows.count()

  const dialog = page.getByRole('dialog', { name: 'Select Part from Inventory' })
  await expect(async () => {
    await page.getByRole('button', { name: 'From Inventory', exact: true }).click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  await dialog.getByPlaceholder('Search inventory...').fill(name)
  await dialog
    .getByRole('button', { name: new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
    .first()
    .click()

  // The picked part is put at the top of the list, and comes in at one.
  await expect(rows).toHaveCount(before + 1)
  await setPartQuantityField(page, quantity)
}

/** Types a quantity into the first part row, which is the one just added. */
export async function setPartQuantityField(page: Page, quantity: number): Promise<void> {
  const row = partRows(page).first().locator('xpath=ancestor::*[.//input[@placeholder="Cost"]][1]')
  await row.locator('input[type="number"]').first().fill(String(quantity))
}
