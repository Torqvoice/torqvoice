import { expect, test } from '@playwright/test'
import { forgetSystemSetting, setSystemSetting } from '../../support/db'

/**
 * A closed sign-up page says so.
 *
 * `registration.disabled` is the app's own switch, set from its admin page or
 * from torqvoice.com when the cloud is paused for capacity. It used to bounce
 * a visitor to the sign-in form without a word, which is the wrong page for
 * somebody who came to make an account. Now the page explains, offers the
 * sign-in link for people who already have one, and the API refuses too.
 */

test.describe.configure({ mode: 'serial' })

// A stranger, no session.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()

test.beforeAll(async () => {
  await setSystemSetting('registration.disabled', 'true')
})

test.afterAll(async () => {
  await forgetSystemSetting('registration.disabled')
})

test.describe('with registration switched off', () => {
  test('the sign-up page explains and points at sign-in', async ({ page }) => {
    await page.goto('/auth/sign-up')
    await expect(page.getByRole('heading', { name: 'Sign-ups are paused' })).toBeVisible()
    await expect(page.locator('#email'), 'no form to fill').toHaveCount(0)

    await page.getByRole('link', { name: 'Go to sign in' }).click()
    await page.waitForURL(/\/auth\/sign-in/)
  })

  test('the API refuses a sign-up as well', async ({ request }) => {
    const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'
    const response = await request.post(`${baseURL}/api/public/auth/sign-up/email`, {
      data: {
        name: 'E2E Paused',
        email: `e2e-paused-${stamp}@example.com`,
        password: `E2e-pass-${stamp}`,
      },
      headers: { origin: baseURL },
    })
    expect(response.ok(), `status ${response.status()}`).toBe(false)
  })
})

test.describe('with registration switched on again', () => {
  test('the form is back', async ({ page }) => {
    await forgetSystemSetting('registration.disabled')
    await page.goto('/auth/sign-up')
    await expect(page.locator('#email')).toBeVisible()
  })
})
