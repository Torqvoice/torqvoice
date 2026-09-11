import { expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'

/**
 * Searching the vehicle list with a number.
 *
 * A four-digit word is also tried as a model year, which is how "2023" finds
 * the 2023 cars. Every all-digit word used to be tried that way, and a phone
 * number with its country code is past what the year column holds: the
 * database refused the query and the list was replaced by the raw error, query
 * code and server paths included.
 */

/** Words that belong to the database, never to a page a workshop reads. */
const LEAKED = /Invalid `|invocation|out of range for type|prisma|\.next\/|TURBOPACK/i

async function expectNoLeak(page: Page): Promise<void> {
  await expect(page.getByText(LEAKED)).toHaveCount(0)
}

test('a long number finds nothing, instead of breaking the list', async ({ page }) => {
  await page.goto('/vehicles?search=4791234567')
  await settle(page)

  await expect(page.getByText('No vehicles match your search.')).toBeVisible()
  await expect(page.getByText('Failed to load vehicles')).toHaveCount(0)
  await expectNoLeak(page)
})

test('a full phone number finds its customer in the global search', async ({ page }) => {
  // James Mitchell is seeded with +1 (555) 201-3344. Eleven digits were tried
  // as a model year too, and that one failed query took every other result of
  // the search down with it, the customer whose number it is included.
  await page.goto('/vehicles')
  await settle(page)
  const input = page.getByPlaceholder('Search by name, plate, phone, VIN, invoice…')
  await expect(async () => {
    await page.keyboard.press('Control+k')
    await expect(input).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  await input.fill('15552013344')
  await expect(page.getByRole('option', { name: /James Mitchell/ }).first()).toBeVisible({
    timeout: 15_000,
  })
  await expectNoLeak(page)
})

test('a year still finds the vehicles from that year', async ({ page }) => {
  // The seeded Camry XSE is a 2023.
  await page.goto('/vehicles?search=2023')
  await settle(page)

  await expect(page.getByRole('link', { name: /Camry/ }).first()).toBeVisible()
  await expectNoLeak(page)
})
