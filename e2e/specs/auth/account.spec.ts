import { type Browser, type BrowserContext, expect, type Page, test } from '@playwright/test'
import { storedTwoFactorSecret } from '../../support/db'
import { fillSettled } from '../../support/hydration'
import { currentTotpCode } from '../../support/totp'

/**
 * What a signed-in owner can do to their own account: change the password,
 * and put an authenticator in front of the sign-in.
 *
 * Both flows change how the owner signs in, so each is put back the way it
 * was before the file ends, and the steps run in order.
 */

test.describe.configure({ mode: 'serial' })

const email = process.env.E2E_USER_EMAIL ?? 'demo@torqvoice.com'
const password = process.env.E2E_USER_PASSWORD ?? 'demo-e2e-pass'
const changed = `E2e-changed-${Date.now()}`

/** A fresh, signed-out browser context: the way a new sign-in would happen. */
async function signedOut(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return context.newPage()
}

async function signIn(page: Page, secret: string) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(secret)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

async function changePassword(page: Page, from: string, to: string) {
  await page.goto('/settings/account')
  await fillSettled(page.locator('#currentPassword'), from)
  await fillSettled(page.locator('#newPassword'), to)
  await fillSettled(page.locator('#confirmPassword'), to)
  await page.getByRole('button', { name: 'Change Password', exact: true }).click()
  await expect(page.getByText('Password changed', { exact: true })).toBeVisible()
}

test.describe('password', () => {
  // One context for both steps, and its session saved afterwards: changing
  // the password ends every session on the account, the caller's included,
  // and hands this context a new one. A fresh context from the saved state
  // would come back with the token the change deleted.
  let owner: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    page = await owner.newPage()
  })

  test.afterAll(async () => {
    await owner.storageState({ path: 'e2e/.auth/owner.json' })
    await owner.close()
  })

  test('is changed from account settings and works at the door', async ({ browser }) => {
    await changePassword(page, password, changed)

    const fresh = await signedOut(browser)
    await signIn(fresh, changed)
    await fresh.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
    await fresh.context().close()
  })

  test('is put back for the rest of the suite', async () => {
    await changePassword(page, changed, password)
  })
})

test.describe('two-factor authentication', () => {
  // One browser context for the three steps. Enabling 2FA makes better-auth
  // rotate the session, and a fresh context per test would come back with
  // the token from setup, which the rotation deleted: the pages would still
  // render off the cookie cache, but anything sensitive would be refused.
  let owner: BrowserContext
  let page: Page

  test.beforeAll(async ({ browser }) => {
    owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    page = await owner.newPage()
  })

  test.afterAll(async () => {
    // The rest of the suite signs in with the saved state; hand it the
    // session this context ended up with, not the one 2FA retired.
    await owner.storageState({ path: 'e2e/.auth/owner.json' })
    await owner.close()
  })

  test('an authenticator app is enrolled with a code it generates', async () => {
    await page.goto('/settings/account')
    // Ids that start with a digit are not valid CSS selectors, hence the attribute form.
    const dialog = page.getByRole('dialog')
    await expect(async () => {
      await page.getByRole('button', { name: 'Enable 2FA', exact: true }).click()
      await expect(dialog.locator('[id="2fa-enable-password"]')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await dialog.locator('[id="2fa-enable-password"]').fill(password)
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()

    // The QR code step. The secret it encodes is in the database by now,
    // which is how the test plays the part of the phone.
    await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
    const stored = await storedTwoFactorSecret(email)
    expect(stored, 'better-auth stored a secret when 2FA was enabled').not.toBeNull()

    await dialog.locator('[id="2fa-verify-code"]').fill(await currentTotpCode(stored as string))
    await dialog.getByRole('button', { name: 'Verify', exact: true }).click()

    await dialog.getByRole('button', { name: /saved my backup codes/i }).click()
    await expect(page.getByText(/two-factor authentication (is )?enabled/i).first()).toBeVisible()
  })

  test('signing in now asks for the code before opening anything', async ({ browser }) => {
    const fresh = await signedOut(browser)
    await signIn(fresh, password)
    await fresh.waitForURL(/\/auth\/verify-2fa/, { timeout: 30_000 })

    // Nothing behind the door without the code.
    await fresh.goto('/customers')
    await expect(fresh).toHaveURL(/\/auth\//)

    await fresh.goto('/auth/verify-2fa')
    const stored = await storedTwoFactorSecret(email)
    await fresh.locator('#code').fill(await currentTotpCode(stored as string))
    await fresh.getByRole('button', { name: 'Verify', exact: true }).click()
    await fresh.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
    await fresh.context().close()
  })

  test('is switched off again with the password', async () => {
    await page.goto('/settings/account')
    await fillSettled(page.locator('[id="2fa-disable-password"]'), password)
    await page.getByRole('button', { name: 'Disable 2FA', exact: true }).click()

    // Off in the page, and gone from the database.
    await expect(page.getByRole('button', { name: 'Enable 2FA', exact: true })).toBeVisible({
      timeout: 15_000,
    })
    expect(await storedTwoFactorSecret(email)).toBeNull()
  })
})
