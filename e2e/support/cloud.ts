import { type BrowserContext, expect, type Page } from '@playwright/test'
import { settle } from './hydration'

/**
 * Driving the app in cloud mode, as a stranger arrives at it.
 *
 * Cloud mode is where the free plan's limits bite, where the sign-up page
 * makes its case, and where Google sign-in exists. The specs under
 * `specs/cloud` run against the same build started with TORQVOICE_MODE=cloud
 * (see `E2E_MODE` in playwright.config.ts), and each opens a workshop of its
 * own rather than touching the seeded one.
 */

const standin = process.env.E2E_GOOGLE_STANDIN ?? 'http://127.0.0.1:8027'

export interface GoogleAccount {
  sub: string
  email: string
  email_verified: boolean
  name: string
}

/** Offers an account in the stand-in's chooser. Unverified only when asked. */
export async function registerGoogleAccount(account: {
  email: string
  name?: string
  emailVerified?: boolean
}): Promise<GoogleAccount> {
  const response = await fetch(`${standin}/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: account.email,
      name: account.name ?? account.email,
      email_verified: account.emailVerified ?? true,
    }),
  })
  if (!response.ok) {
    throw new Error(
      `the Google stand-in answered ${response.status}. Is e2e/google-standin.ts running?`
    )
  }
  return response.json()
}

export interface GoogleStandinState {
  accounts: GoogleAccount[]
  authorizeRequests: Record<string, string>[]
  tokenExchanges: { clientId: string; code: string; hadVerifier: boolean }[]
}

export async function googleStandin(): Promise<GoogleStandinState> {
  return (await fetch(`${standin}/state`)).json()
}

export async function clearGoogleStandin(): Promise<void> {
  await fetch(`${standin}/state`, { method: 'DELETE' })
}

/**
 * Sends the browser's trip to Google to the stand-in instead. The app builds
 * the real `accounts.google.com` address, as it would for a customer; only
 * where the browser lands changes.
 */
export async function routeGoogleToStandin(context: BrowserContext): Promise<void> {
  await context.route('https://accounts.google.com/**', async (route) => {
    const url = new URL(route.request().url())
    await route.fulfill({
      status: 302,
      headers: { location: `${standin}${url.pathname}${url.search}` },
    })
  })
}

/** Signs up with a password on the cloud sign-up page, landing in onboarding. */
export async function signUpWithPassword(
  page: Page,
  person: { name: string; email: string; password: string }
): Promise<void> {
  await page.goto('/auth/sign-up')
  await settle(page)
  await page.locator('#name').fill(person.name)
  await page.locator('#email').fill(person.email)
  await page.locator('#password').fill(person.password)
  await page.locator('#terms').click()
  // By type, not by name: the button's wording is the page's pitch, and a
  // spec that signs up in another language must still find it.
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
}

/** Names the workshop and finishes onboarding, with or without the sample data. */
export async function completeOnboarding(
  page: Page,
  workshopName: string,
  { sampleData }: { sampleData: boolean }
): Promise<void> {
  await settle(page)
  await page.locator('#workshopName').fill(workshopName)
  const sample = page.locator('#loadSampleData')
  const checked =
    (await sample.getAttribute('aria-checked')) === 'true' ||
    (await sample.isChecked().catch(() => false))
  if (checked !== sampleData) await sample.click()
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 60_000 })
}

/** The dialog a plan limit opens, in place of an error. */
export function upgradeDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Upgrade to keep going' })
}

/** Waits for the upgrade dialog and checks it offers the way to a plan. */
export async function expectUpgradeOffered(page: Page, reason: RegExp): Promise<void> {
  const dialog = upgradeDialog(page)
  await expect(dialog, 'the plan limit is offered as an upgrade').toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByText(reason)).toBeVisible()
  await expect(dialog.getByRole('link')).toHaveAttribute('href', '/settings/subscription')
}
