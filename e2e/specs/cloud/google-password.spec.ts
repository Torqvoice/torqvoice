import { expect, test } from '@playwright/test'
import {
  chooseGoogleAccount,
  completeOnboarding,
  continueWithGoogle,
  registerGoogleAccount,
  routeGoogleToStandin,
  signInWithPassword,
} from '../../support/cloud'
import { ageSessionsOf, personWithEmail } from '../../support/db'
import { fillSettled, settle } from '../../support/hydration'
import { waitForMail } from '../../support/mail'

/**
 * A password for someone who signed up with Google.
 *
 * Their account has none, so the Change password card had no current
 * password to check and answered "Credential account not found", and the
 * two-factor card walked them as far as a password field they could not fill
 * in. The account page now offers to set one instead.
 *
 * A password is a way into the account that outlives the session, so the
 * server only sets one straight after a sign-in. That is the path worth a
 * browser: the person is told to sign in again, is taken there, comes back to
 * the same page, and finishes. Then the password has to be one the sign-in
 * page accepts, which only shows with the auth pieces assembled.
 */

// Signing up and onboarding a workshop takes longer than an ordinary test.
test.describe.configure({ mode: 'serial', timeout: 180_000 })

// A stranger's browser, every time.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const PERSON = `e2e-google-set-password-${stamp}@example.com`
const FIRST = `E2e-first-${stamp}`
const SECOND = `E2e-second-${stamp}`

test.beforeEach(async ({ context }) => {
  await routeGoogleToStandin(context)
})

test.describe('someone who signed up with Google', () => {
  test('is offered to set a password, and is not asked for a current one', async ({ page }) => {
    await registerGoogleAccount({ email: PERSON, name: 'E2E Google Password' })
    await continueWithGoogle(page, '/auth/sign-up', PERSON)
    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await completeOnboarding(page, `E2E Google Password Garage ${stamp}`, { sampleData: false })

    await page.goto('/settings/account')
    await settle(page)

    await expect(page.getByText('Set a Password', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Set Password', exact: true })).toBeVisible()
    await expect(page.locator('#currentPassword'), 'no current password to ask for').toHaveCount(0)

    // Two-factor confirms with the account's password, so it waits for one.
    await expect(page.getByRole('button', { name: 'Enable 2FA', exact: true })).toBeDisabled()
    await expect(page.getByText(/Set a password first/)).toBeVisible()
  })

  test('is sent to sign in again when the sign-in is not recent, and comes back to finish', async ({
    page,
  }) => {
    await continueWithGoogle(page, '/auth/sign-in', PERSON)
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
    // The tab has been open since this morning.
    await ageSessionsOf(PERSON, 30)

    await page.goto('/settings/account')
    await settle(page)
    await fillSettled(page.locator('#newPassword'), FIRST)
    await fillSettled(page.locator('#confirmPassword'), FIRST)
    await page.getByRole('button', { name: 'Set Password', exact: true }).click()

    await expect(page.getByText('Sign in again before setting a password.')).toBeVisible()
    expect((await personWithEmail(PERSON)).providers, 'nothing was set').toEqual(['google'])

    // Out, through Google, and back to the page they were on.
    await page.getByRole('button', { name: 'Sign in again', exact: true }).click()
    await page.waitForURL(/\/auth\/sign-in\?redirect=%2Fsettings%2Faccount/, { timeout: 30_000 })
    await chooseGoogleAccount(page, PERSON)
    await page.waitForURL(/\/settings\/account/, { timeout: 30_000 })
    await settle(page)

    await fillSettled(page.locator('#newPassword'), FIRST)
    await fillSettled(page.locator('#confirmPassword'), FIRST)
    await page.getByRole('button', { name: 'Set Password', exact: true }).click()

    await expect(page.getByText(/Password set\./)).toBeVisible()
    // The card is the ordinary one from here on, and two-factor is open.
    await expect(page.locator('#currentPassword')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Change Password', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enable 2FA', exact: true })).toBeEnabled()

    expect((await personWithEmail(PERSON)).providers).toEqual(['credential', 'google'])

    // And the address is told, in case it was not them.
    const notice = await waitForMail(PERSON, { subject: /password was added/i })
    expect(notice.text).toContain('A password was just set on your Torqvoice account')
  })

  test('signs in with the email address and that password, and can change it', async ({ page }) => {
    await signInWithPassword(page, { email: PERSON, password: FIRST })
    await expect(page.getByText(`E2E Google Password Garage ${stamp}`).first()).toBeVisible()

    await page.goto('/settings/account')
    await settle(page)
    await fillSettled(page.locator('#currentPassword'), FIRST)
    await fillSettled(page.locator('#newPassword'), SECOND)
    await fillSettled(page.locator('#confirmPassword'), SECOND)
    await page.getByRole('button', { name: 'Change Password', exact: true }).click()

    await expect(page.getByText('Password changed', { exact: true })).toBeVisible()
  })

  test('signs in with the changed password, and Google still works too', async ({
    page,
    browser,
  }) => {
    await signInWithPassword(page, { email: PERSON, password: SECOND })
    await expect(page.getByText(`E2E Google Password Garage ${stamp}`).first()).toBeVisible()

    const other = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    await routeGoogleToStandin(other)
    const viaGoogle = await other.newPage()
    await continueWithGoogle(viaGoogle, '/auth/sign-in', PERSON)
    await viaGoogle.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), {
      timeout: 30_000,
    })
    await expect(viaGoogle.getByText(`E2E Google Password Garage ${stamp}`).first()).toBeVisible()
    await other.close()

    expect((await personWithEmail(PERSON)).users, 'still one person').toBe(1)
  })
})
