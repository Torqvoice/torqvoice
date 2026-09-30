import { test as setup, expect } from '@playwright/test'

/**
 * Signs in once and keeps the session on disk. Every other spec starts already
 * authenticated, which saves a login per test and keeps the sign-in flow tested
 * in exactly one place.
 */

const AUTH_STATE = 'e2e/.auth/owner.json'

const email = process.env.E2E_USER_EMAIL ?? 'demo@torqvoice.com'
const password = process.env.E2E_USER_PASSWORD ?? 'demo-e2e-pass'

setup('sign in as the workshop owner', async ({ page, context }) => {
  await page.goto('/auth/sign-in')

  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()

  // Landing anywhere outside /auth means the session cookie was accepted.
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
  await expect(page.locator('#password')).toHaveCount(0)

  // A workshop that predates a feature is greeted with an announcement card
  // on its first page ("Your emails have a new look"). It is a non-modal
  // dialog, so a spec looking for "the dialog" finds it as well as its own.
  // Closed here through its own button, which the app records for the whole
  // workshop, so no spec starts with one on screen. Announcements queue one
  // at a time, hence the loop.
  const gotIt = page.getByRole('button', { name: 'Got it', exact: true })
  for (let shown = 0; shown < 5; shown++) {
    const open = await gotIt
      .first()
      .waitFor({ state: 'visible', timeout: 3_000 })
      .then(() => true)
      .catch(() => false)
    if (!open) break
    await gotIt.first().click()
    await expect(gotIt).toHaveCount(0, { timeout: 10_000 })
  }

  // The app reads its language from this cookie before Accept-Language. Set
  // here rather than per test so the saved state carries it everywhere.
  const { hostname } = new URL(page.url())
  await context.addCookies([{ name: 'locale', value: 'en', domain: hostname, path: '/' }])

  await context.storageState({ path: AUTH_STATE })
})
