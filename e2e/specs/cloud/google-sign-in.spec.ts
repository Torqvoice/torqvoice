import { expect, type Page, test } from '@playwright/test'
import {
  clearGoogleStandin,
  completeOnboarding,
  googleStandin,
  registerGoogleAccount,
  routeGoogleToStandin,
  signUpWithPassword,
} from '../../support/cloud'
import { personWithEmail } from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * Signing in with Google, and who a Google account is allowed to become.
 *
 * Google here is `e2e/google-standin.ts`: its account chooser takes the
 * browser's trip to accounts.google.com, and its token endpoint takes the
 * server's code exchange. Each test offers the accounts it needs, with the
 * `email_verified` it needs.
 *
 * The rule most worth a test is account linking. A Google sign-in whose
 * address matches an existing password account is attached to that account,
 * which is what a returning customer expects. But an address Google has not
 * verified proves nothing about who is signing in: anyone can create a Google
 * account with somebody else's address on it. Attached to the account that
 * owns the address, that is a way into another person's workshop.
 */

// Signing up and onboarding a workshop in a hook takes longer than a test.
test.describe.configure({ mode: 'serial', timeout: 180_000 })

// A stranger's browser, every time.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const NEWCOMER = `e2e-google-new-${stamp}@example.com`
const RETURNING = `e2e-google-password-${stamp}@example.com`
const OWNER = `e2e-google-owner-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`

test.beforeAll(async ({ browser }) => {
  await clearGoogleStandin()

  // Two people who signed up with a password before Google was offered, each
  // with a workshop of their own.
  for (const [email, workshop] of [
    [RETURNING, `E2E Returning Garage ${stamp}`],
    [OWNER, `E2E Owner Garage ${stamp}`],
  ]) {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await context.newPage()
    await signUpWithPassword(page, { name: 'E2E Password Person', email, password: PASSWORD })
    await completeOnboarding(page, workshop, { sampleData: false })
    await context.close()
  }
})

test.beforeEach(async ({ context }) => {
  await routeGoogleToStandin(context)
})

/** Presses "Continue with Google" and picks an account in the chooser. */
async function continueWithGoogle(page: Page, from: string, email: string): Promise<void> {
  await page.goto(from)
  await settle(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible({
      timeout: 5_000,
    })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('button', { name: email, exact: true }).click()
}

test.describe('Google sign-in', () => {
  test('is offered on the sign-in and the sign-up page', async ({ page }) => {
    for (const path of ['/auth/sign-in', '/auth/sign-up']) {
      await page.goto(path)
      await expect(
        page.getByRole('button', { name: 'Continue with Google' }),
        `${path} offers it`
      ).toBeVisible()
    }
  })

  test('takes a newcomer to setting up a workshop', async ({ page }) => {
    await registerGoogleAccount({ email: NEWCOMER, name: 'E2E Google Newcomer' })
    await continueWithGoogle(page, '/auth/sign-up', NEWCOMER)

    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Set up your workshop' })).toBeVisible()

    const person = await personWithEmail(NEWCOMER)
    expect(person).toEqual({ users: 1, providers: ['google'], emailVerified: true })

    // What was asked of Google: this app's client, the chooser every time
    // (a workshop laptop is shared), and a code only this browser can redeem.
    const { authorizeRequests, tokenExchanges } = await googleStandin()
    const asked = authorizeRequests.at(-1)
    expect(asked?.client_id).toBe('e2e-google-client')
    expect(asked?.prompt).toBe('select_account')
    expect(asked?.code_challenge, 'PKCE').toBeTruthy()
    expect(tokenExchanges.at(-1)?.hadVerifier, 'the verifier came with the code').toBe(true)

    await completeOnboarding(page, `E2E Google Garage ${stamp}`, { sampleData: false })
  })

  test('brings the same person back to their workshop next time', async ({ page }) => {
    await continueWithGoogle(page, '/auth/sign-in', NEWCOMER)

    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
    await expect(page.getByText(`E2E Google Garage ${stamp}`).first()).toBeVisible()
    expect((await personWithEmail(NEWCOMER)).users, 'still one person').toBe(1)
  })

  test('joins a password account whose address Google has verified', async ({ page }) => {
    await registerGoogleAccount({ email: RETURNING, emailVerified: true })
    await continueWithGoogle(page, '/auth/sign-in', RETURNING)

    // Into the workshop they already had, not into a second onboarding.
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
    await expect(page.getByText(`E2E Returning Garage ${stamp}`).first()).toBeVisible()

    const person = await personWithEmail(RETURNING)
    expect(person.users, 'one person, not two with the same address').toBe(1)
    expect(person.providers).toEqual(['credential', 'google'])
  })

  test('does not hand an account to a Google address nobody verified', async ({ page }) => {
    // Somebody made a Google account with the owner's address on it. Google
    // says so: the address is not verified.
    await registerGoogleAccount({ email: OWNER, name: 'Not the owner', emailVerified: false })
    await continueWithGoogle(page, '/auth/sign-in', OWNER)

    // Wherever the attempt ends up, it must not be inside the owner's workshop.
    await page.waitForLoadState('networkidle')
    await expect(
      page.getByText(`E2E Owner Garage ${stamp}`),
      'the owner workshop is not opened'
    ).toHaveCount(0)
    await expect(page).toHaveURL(/\/auth\//)

    const person = await personWithEmail(OWNER)
    expect(person.providers, 'no Google account attached to the owner').toEqual(['credential'])
    expect(person.users).toBe(1)
  })

  test('comes back to sign-in, with a way forward, when the person turns back at Google', async ({
    page,
  }) => {
    await page.goto('/auth/sign-in')
    await settle(page)
    await expect(async () => {
      await page.getByRole('button', { name: 'Continue with Google' }).click()
      await expect(page.getByRole('heading', { name: 'Choose an account' })).toBeVisible({
        timeout: 5_000,
      })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('link', { name: 'Cancel' }).click()

    await page.waitForURL(/\/auth\/sign-in/, { timeout: 30_000 })
    await expect(page.getByText(/Google sign-in did not complete/)).toBeVisible()
    // And the password form is still there to use.
    await expect(page.locator('#email')).toBeVisible()
  })
})
