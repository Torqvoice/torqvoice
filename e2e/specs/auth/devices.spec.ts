import { type BrowserContext, expect, type Page, test } from '@playwright/test'
import { sessionCountFor } from '../../support/db'
import { fillSettled } from '../../support/hydration'
import { waitForMail } from '../../support/mail'

/**
 * Who is signed in to an account, and how to get them out.
 *
 * A sign-in from a browser the account has not seen before earns a mail,
 * the account page lists every open session as a device the owner can
 * recognise, any of them can be signed out from there, and a password change
 * ends all the others by itself. That last one is what makes a password
 * change worth anything against a stolen session.
 */

test.describe.configure({ mode: 'serial' })

const email = process.env.E2E_USER_EMAIL ?? 'demo@torqvoice.com'
const password = process.env.E2E_USER_PASSWORD ?? 'demo-e2e-pass'
const stamp = Date.now()
const changed = `E2e-devices-${stamp}`

/** A phone: no cookies from anywhere, and a user agent the list will name. */
const PHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

async function signIn(page: Page, secret = password) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(secret)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

/** Whether a context's session is still honoured, asked past the cookie cache. */
async function stillSignedIn(context: BrowserContext): Promise<boolean> {
  const response = await context.request.get('/api/public/auth/get-session?disableCookieCache=true')
  const body = await response.text()
  return body !== 'null' && body !== ''
}

let phone: BrowserContext

test.beforeAll(async ({ browser }) => {
  phone = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    userAgent: PHONE_UA,
  })
})

test.afterAll(async () => {
  await phone.close()
})

test('a sign-in from a new browser mails the owner', async () => {
  const before = Date.now()
  const page = await phone.newPage()
  await signIn(page)

  const mail = await waitForMail(email, { subject: /new sign-in/i })
  expect(mail.html).toContain('Safari on iPhone')
  expect(mail.html).toContain('/settings/account')
  expect(new Date(mail.receivedAt).getTime()).toBeGreaterThanOrEqual(before - 60_000)
})

test('the account page lists the phone and signs it out', async ({ page }) => {
  await page.goto('/settings/account')
  const list = page.getByTestId('signed-in-devices')
  const own = list.getByTestId('signed-in-device').filter({ hasText: 'This device' })
  await expect(own).toHaveCount(1)
  const iphone = list.getByTestId('signed-in-device').filter({ hasText: 'Safari on iPhone' })
  await expect(iphone.first()).toBeVisible()

  const sessionsBefore = await sessionCountFor(email)
  await iphone
    .first()
    .getByRole('button', { name: /sign out/i })
    .click()
  await expect(page.getByText('Device signed out', { exact: true })).toBeVisible()
  await expect(
    list.getByTestId('signed-in-device').filter({ hasText: 'Safari on iPhone' })
  ).toHaveCount(0)

  expect(await sessionCountFor(email)).toBe(sessionsBefore - 1)
  expect(await stillSignedIn(phone), 'the phone is out').toBe(false)
})

test('changing the password ends every other device', async ({ page, browser }) => {
  const other = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  await signIn(await other.newPage())
  expect(await stillSignedIn(other)).toBe(true)

  await page.goto('/settings/account')
  await fillSettled(page.locator('#currentPassword'), password)
  await fillSettled(page.locator('#newPassword'), changed)
  await fillSettled(page.locator('#confirmPassword'), changed)
  await page.getByRole('button', { name: 'Change Password', exact: true }).click()
  await expect(page.getByText('Password changed', { exact: true })).toBeVisible()

  expect(await stillSignedIn(other), 'the other browser is out').toBe(false)
  expect(await sessionCountFor(email), 'only the changing browser remains').toBe(1)
  await other.close()

  // Put the seeded password back for the rest of the suite, and save the
  // session this browser ended up with: each change retired the one before.
  await fillSettled(page.locator('#currentPassword'), changed)
  await fillSettled(page.locator('#newPassword'), password)
  await fillSettled(page.locator('#confirmPassword'), password)
  await page.getByRole('button', { name: 'Change Password', exact: true }).click()
  await expect(page.getByText('Password changed', { exact: true }).first()).toBeVisible()
  await page.context().storageState({ path: 'e2e/.auth/owner.json' })
})
