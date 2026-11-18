import { expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'

/**
 * A tab left open for days. Found in PostHog on 27 Oct 2026: a workshop came
 * back to a dashboard from before a deploy, with its session gone, and clicked
 * Work orders five times over 16 seconds with nothing on screen before Next
 * reloaded the page and the layout sent them to sign-in. They then landed on
 * the dashboard rather than the page they wanted.
 *
 * The session is ended by dropping this context's session cookie, which is
 * what the server sees once a session expires, and leaves the shared owner
 * session in e2e/.auth/owner.json alone.
 */

const email = process.env.E2E_USER_EMAIL ?? 'demo@torqvoice.com'
const password = process.env.E2E_USER_PASSWORD ?? 'demo-e2e-pass'

/** What a browser does when someone switches back to the tab. */
async function bringTabBack(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

async function signIn(page: Page) {
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

test.describe('a tab that went stale', () => {
  test('offers a reload once the server runs a newer build', async ({ page }) => {
    await page.route('**/api/public/version', (route) =>
      route.fulfill({ json: { version: 'a-newer-build' } })
    )
    await page.goto('/work-orders')
    await settle(page)

    const toast = page
      .locator('[data-sonner-toast]')
      .filter({ hasText: 'A new version is available' })
    await expect(async () => {
      await bringTabBack(page)
      await expect(toast).toBeVisible({ timeout: 2_000 })
    }).toPass()

    const reloaded = page.waitForEvent('load')
    await toast.getByRole('button', { name: 'Reload' }).click()
    await reloaded
    await expect(page).toHaveURL(/\/work-orders$/)
  })

  test('says nothing while the build is the same', async ({ page }) => {
    const asked = page.waitForRequest('**/api/public/version')
    await page.goto('/work-orders')
    await settle(page)
    await bringTabBack(page)
    await asked

    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0)
  })

  test('goes to sign-in when the tab comes back without a session, and returns', async ({
    page,
    context,
  }) => {
    await page.goto('/work-orders?status=pending')
    await settle(page)

    await context.clearCookies({ name: /session_token/ })
    await bringTabBack(page)

    await page.waitForURL(/\/auth\/sign-in\?redirect=%2Fwork-orders%3Fstatus%3Dpending/)
    await settle(page)
    await expect(async () => {
      await signIn(page)
      await page.waitForURL(/\/work-orders\?status=pending$/, { timeout: 5_000 })
    }).toPass()
  })

  test('a page opened without a session comes back to itself after sign-in', async ({
    browser,
  }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()

    await page.goto('/work-orders?status=pending')
    await page.waitForURL(/\/auth\/sign-in\?redirect=%2Fwork-orders%3Fstatus%3Dpending/)
    await settle(page)
    await expect(async () => {
      await signIn(page)
      await page.waitForURL(/\/work-orders\?status=pending$/, { timeout: 5_000 })
    }).toPass()

    await context.close()
  })
})
