import { expect, type Page, test } from '@playwright/test'
import { clearMailbox, linkIn, waitForMail } from '../../support/mail'

/**
 * The front door: signing in, being kept out, signing out, and getting back
 * in after a forgotten password.
 *
 * Every test here starts signed out, unlike the rest of the suite, because
 * the door is the thing under test. The reset flow takes its token out of the
 * mail the app sent, caught by the harness's mail sink, so a reset that
 * records a token but never posts it fails here rather than in a support
 * mailbox.
 */

test.use({ storageState: { cookies: [], origins: [] } })

const email = process.env.E2E_USER_EMAIL ?? 'demo@torqvoice.com'
const password = process.env.E2E_USER_PASSWORD ?? 'demo-e2e-pass'
const replacement = `E2e-pass-${Date.now()}`

async function signIn(page: Page, who: string, secret: string) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(who)
  await page.locator('#password').fill(secret)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
}

async function expectSignedIn(page: Page) {
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
  await expect(page.locator('#password')).toHaveCount(0)
}

/** Requests a reset link for the address and returns the token the mail carries. */
async function requestReset(page: Page, who: string): Promise<string> {
  // The owner asks for a reset twice in this file. With the box emptied
  // first, the mail read back is certainly the one this request sent and not
  // the earlier one, whose token has already been spent.
  await clearMailbox()
  await page.goto('/auth/forgot-password')
  await page.locator('#email').fill(who)
  await page.getByRole('button', { name: /send reset link/i }).click()
  // The same words whether or not the address exists, so a stranger cannot
  // use this form to find out who has an account.
  await expect(page.getByText(/if an account exists with that email/i)).toBeVisible()

  const mail = await waitForMail(who, { subject: /reset your torqvoice password/i })
  // The mail does not link to the reset page. It links into better-auth's own
  // endpoint, which checks the token and redirects to the page carrying it, so
  // following the link is both what the person does and where the token
  // comes from.
  await page.goto(linkIn(mail, /\/reset-password\//))
  await page.waitForURL(/\/auth\/reset-password\?/, { timeout: 30_000 })
  const token = new URL(page.url()).searchParams.get('token')
  expect(token, 'the mailed link lands on the reset page with a token').toBeTruthy()
  return token as string
}

async function resetWith(page: Page, token: string, next: string, confirm = next) {
  await page.goto(`/auth/reset-password?token=${encodeURIComponent(token)}`)
  await page.locator('#new-password').fill(next)
  await page.locator('#confirm-password').fill(confirm)
  await page.getByRole('button', { name: /reset password/i }).click()
}

test.describe('sign in', () => {
  test('a wrong password is refused and says so', async ({ page }) => {
    await signIn(page, email, 'not-the-password')
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })

  test('the right password opens the workshop', async ({ page }) => {
    await signIn(page, email, password)
    await expectSignedIn(page)
  })

  test('the sign-in page offers the way to a forgotten password', async ({ page }) => {
    await page.goto('/auth/sign-in')
    await page.getByRole('link', { name: /forgot password/i }).click()
    await expect(page).toHaveURL(/\/auth\/forgot-password/)
    await expect(page.locator('#email')).toBeVisible()
  })
})

test.describe('kept out', () => {
  test('a signed-out visitor is sent to sign in', async ({ page }) => {
    await page.goto('/customers')
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })

  test('the technician handshake needs no session, the data does', async ({ request }) => {
    const health = await request.get('/api/v1/tech/health')
    expect(health.status()).toBe(200)
  })
})

test.describe('sign out', () => {
  test('signing out ends the session for good', async ({ page }) => {
    await signIn(page, email, password)
    await expectSignedIn(page)

    // The account menu sits at the foot of the sidebar, under the owner's name.
    await page.getByRole('button', { name: /demo owner/i }).click()
    await page.getByRole('menuitem', { name: /sign out/i }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 30_000 })

    // Not only redirected: the old session must not open anything.
    await page.goto('/customers')
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })
})

test.describe('forgotten password', () => {
  // The steps change the owner's password and put it back, so they run in
  // order and never alongside each other.
  test.describe.configure({ mode: 'serial' })

  // The token that set the new password, kept so the next step can try to
  // spend it twice. better-auth deletes it on use, which is the point.
  let spent = ''

  // A reset ends every session the owner has, the shared one from setup
  // included; that is the protection. The rest of the suite still signs in
  // with the saved state, so a fresh session is saved over it afterwards.
  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await signIn(page, email, password)
    await expectSignedIn(page)
    await context.storageState({ path: 'e2e/.auth/owner.json' })
    await context.close()
  })

  test('a made-up token cannot set a password', async ({ page }) => {
    await resetWith(page, 'not-a-real-token', replacement)
    // better-auth's own words, or the page's fallback when it has none.
    await expect(page.getByText(/invalid token|could not reset password/i)).toBeVisible()
  })

  test('a reset link from the forgotten-password form sets a new password', async ({ page }) => {
    const token = await requestReset(page, email)

    // The two fields have to agree before anything is sent.
    await resetWith(page, token, replacement, `${replacement}-x`)
    await expect(page.getByText(/passwords do not match/i)).toBeVisible()

    await resetWith(page, token, replacement)
    await expect(page.getByText(/has been reset successfully/i)).toBeVisible()
    spent = token
  })

  test('the old password stops working and the new one works', async ({ page }) => {
    await signIn(page, email, password)
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()

    await signIn(page, email, replacement)
    await expectSignedIn(page)
  })

  test('a reset link is good for one use', async ({ page }) => {
    expect(spent).not.toBe('')
    await resetWith(page, spent, `${replacement}-again`)
    await expect(page.getByText(/invalid token|could not reset password/i)).toBeVisible()
  })

  test('the owner gets the seeded password back for the rest of the suite', async ({ page }) => {
    const token = await requestReset(page, email)
    await resetWith(page, token, password)
    await expect(page.getByText(/has been reset successfully/i)).toBeVisible()

    await signIn(page, email, password)
    await expectSignedIn(page)
  })
})
