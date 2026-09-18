import { expect, type Locator, type Page } from '@playwright/test'

/**
 * The warranty panel, which is one component on the quote editor and on the
 * work order editor. It is folded shut until a document says something about
 * warranty, so everything here opens it first.
 */

export type WarrantyStatement = 'Not stated' | 'Included' | 'Not included'

/** The panel, opened. */
export async function warrantyPanel(page: Page): Promise<Locator> {
  const panel = page.getByTestId('warranty-section')
  await expect(panel).toBeVisible()
  const header = panel.getByRole('button', { name: /^Warranty/ })
  await expect(async () => {
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click()
    await expect(panel.getByRole('radiogroup')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  return panel
}

/** Which of the three statements the open document currently makes. */
export async function expectWarrantyStatement(
  page: Page,
  statement: WarrantyStatement
): Promise<Locator> {
  const panel = await warrantyPanel(page)
  await expect(panel.getByRole('radio', { name: statement, exact: true })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  return panel
}

/** Picks a statement, retried because a click before hydration does nothing. */
export async function chooseWarrantyStatement(
  page: Page,
  statement: WarrantyStatement
): Promise<Locator> {
  const panel = await warrantyPanel(page)
  const choice = panel.getByRole('radio', { name: statement, exact: true })
  await expect(async () => {
    await choice.click()
    await expect(choice).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  return panel
}
