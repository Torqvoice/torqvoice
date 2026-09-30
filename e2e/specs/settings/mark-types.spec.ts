import { expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'

/**
 * The workshop's kinds of mark, edited under Templates → Checklists →
 * Condition map: the eight built-in kinds are there, one can be renamed, a
 * kind of the workshop's own added, and both put back, so the seeded
 * workshop draws with the app's own kinds again afterwards.
 */

const rows = (page: Page) => page.getByTestId('mark-type-row')
const rowNamed = (page: Page, name: string) => rows(page).filter({ hasText: name })

async function openCatalogue(page: Page) {
  await page.goto('/settings/templates?tab=conditionMap')
  await expect(page.getByRole('tab', { name: 'Condition map', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  )
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 })
  await settle(page)
}

async function saveDialog(page: Page) {
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })
}

test.describe.configure({ mode: 'serial' })

test.describe('kinds of mark', () => {
  test('ships the eight built-in kinds', async ({ page }) => {
    await openCatalogue(page)
    await expect(rows(page)).toHaveCount(8)
    for (const name of ['Dent', 'Scratch', 'Stone chip', 'Crack', 'Rust', 'Paint damage']) {
      await expect(rowNamed(page, name), `${name} is listed`).toHaveCount(1)
    }
  })

  test('renames a built-in kind and restores it', async ({ page }) => {
    await openCatalogue(page)
    await rowNamed(page, 'Dent').getByRole('button', { name: 'Edit' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit kind of mark' })
    await dialog.getByLabel('Name').fill('Ding')
    await saveDialog(page)
    await expect(rowNamed(page, 'Ding')).toHaveCount(1)
    await expect(rowNamed(page, 'Dent')).toHaveCount(0)

    // The restore puts the app's own name back.
    await rowNamed(page, 'Ding').getByRole('button', { name: 'Restore' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Restore' }).click()
    await expect(rowNamed(page, 'Dent')).toHaveCount(1, { timeout: 15_000 })
    await expect(rowNamed(page, 'Ding')).toHaveCount(0)
  })

  test('adds a kind of the workshop’s own and removes it again', async ({ page }) => {
    await openCatalogue(page)
    await page.getByRole('button', { name: 'Add kind' }).click()
    const dialog = page.getByRole('dialog', { name: 'New kind of mark' })
    await dialog.getByLabel('Name').fill('Curb rash')
    await dialog.getByRole('button', { name: 'Hexagon' }).click()
    await dialog.getByRole('button', { name: '#e11d48' }).click()
    await saveDialog(page)
    await expect(rows(page)).toHaveCount(9)
    const own = rowNamed(page, 'Curb rash')
    await expect(own).toHaveCount(1)
    await expect(own).toContainText('Hexagon')

    // Hidden kinds stay listed here, greyed, so they can be brought back.
    await own.getByRole('button', { name: 'Hide from the picker' }).click()
    await expect(own.getByText('Hidden')).toBeVisible({ timeout: 15_000 })

    await own.getByRole('button', { name: 'Remove' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click()
    await expect(rows(page)).toHaveCount(8, { timeout: 15_000 })
  })
})
