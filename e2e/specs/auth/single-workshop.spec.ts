import { expect, test } from '@playwright/test'
import { deletePersonWithEmail, organizationCount, personWithEmail } from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * A self-hosted install runs one workshop.
 *
 * The seeded workshop is that one. A stranger who signs up afterwards is not
 * opening a second workshop: they are told to ask its owner for an
 * invitation, and the owner's own "Add New Company" is refused with the
 * pointer to the licence. Both are proved on the count of workshops in the
 * database, not only on what the screen says. Lifting the limit with a
 * licence is a signed token from torqvoice.com, which this harness cannot
 * mint, so that half lives in src/__tests__/lib/features.test.ts.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const STRANGER = `e2e-stranger-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`

let workshops = 0

test.beforeAll(async () => {
  workshops = await organizationCount()
  expect(workshops, 'the install already has its workshop').toBeGreaterThanOrEqual(1)
})

test.afterAll(async () => {
  await deletePersonWithEmail(STRANGER)
})

test.describe('a stranger signing up', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('is told to ask for an invitation instead of opening a workshop', async ({ page }) => {
    await page.goto('/auth/sign-up')
    await settle(page)
    await page.locator('#name').fill('E2E Stranger')
    await page.locator('#email').fill(STRANGER)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('#terms').click()
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })

    await expect(
      page.getByRole('heading', { name: 'This installation already has its workshop' })
    ).toBeVisible()
    await expect(page.getByText(STRANGER)).toBeVisible()
    await expect(page.locator('#workshopName')).toHaveCount(0)

    // The account exists, so an invitation can reach it; the workshop count did not move.
    expect((await personWithEmail(STRANGER)).users).toBe(1)
    expect(await organizationCount()).toBe(workshops)

    await page.getByRole('button', { name: 'Sign out' }).click()
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15_000 })
  })

  test('is sent back to the notice on every visit until invited', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await settle(page)
    await page.locator('#email').fill(STRANGER)
    await page.locator('#password').fill(PASSWORD)
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await expect(
      page.getByRole('heading', { name: 'This installation already has its workshop' })
    ).toBeVisible()
  })
})

test.describe('the owner', () => {
  test('cannot add a second company without a licence', async ({ page }) => {
    await page.goto('/settings/company')
    await settle(page)
    const dialog = page.getByRole('dialog', { name: 'Add New Company' })
    await expect(async () => {
      await page.getByRole('button', { name: 'Add New Company' }).click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await dialog.locator('#settings-org-name').fill(`E2E Second Garage ${stamp}`)
    await dialog.getByRole('button', { name: 'Create Company' }).click()

    await expect(page.getByText('This installation runs one workshop')).toBeVisible()
    expect(await organizationCount()).toBe(workshops)
  })
})
