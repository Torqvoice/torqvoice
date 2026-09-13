import { expect, test } from '@playwright/test'
import { completeOnboarding, signUpWithPassword } from '../../support/cloud'
import { giveProPlan, organizationIdFor, removePlan, setCancelAtPeriodEnd } from '../../support/db'
import { settle } from '../../support/hydration'
import {
  clearTorqvoiceComCalls,
  setTorqvoiceComLinked,
  torqvoiceComState,
  torqvoiceComUrl,
} from '../../support/torqvoice-com'

/**
 * Plans are sold on torqvoice.com, and this is the app's side of it.
 *
 * The site is played by e2e/torqvoice-com-standin.ts, which verifies every
 * token the way the site does, so landing on its checkout page proves the
 * handoff was signed with the shared secret, carries this organization and
 * this buyer, and names this app's origin. The stand-in also refuses the
 * app on request, which is what a wrong secret looks like: the subscription
 * page and its navigation entry must then not exist, since a self-hosted
 * install that copied TORQVOICE_MODE=cloud is in exactly that position.
 *
 * A workshop of its own is opened here by signing up, so nothing about the
 * seeded one changes.
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })

const stamp = Date.now()
const EMAIL = `e2e-billing-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`
const WORKSHOP = `E2E Billing Garage ${stamp}`
const STATE = `e2e/.auth/cloud-billing-${stamp}.json`

let organizationId = ''
let planId = ''

test.use({ storageState: STATE })

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await signUpWithPassword(page, { name: 'E2E Billing Owner', email: EMAIL, password: PASSWORD })
  await completeOnboarding(page, WORKSHOP, { sampleData: false })
  await context.storageState({ path: STATE })
  await context.close()

  organizationId = await organizationIdFor(EMAIL)
  await clearTorqvoiceComCalls()
})

test.afterAll(async () => {
  await setTorqvoiceComLinked(true)
  if (planId) await removePlan(organizationId, planId)
})

/** The app's link check is asked again after a second in this harness. */
async function letTheAppAskAgain(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForTimeout(1_500)
  // The first look after the answer may still serve the old one while the
  // fresh ask completes behind it; a second look sees the new answer.
  await page.reload()
  await settle(page)
  await page.waitForTimeout(500)
}

test.describe('the link to torqvoice.com', () => {
  test('hides the subscription page while the site refuses the app', async ({ page }) => {
    await setTorqvoiceComLinked(false)
    await page.goto('/settings')
    await settle(page)
    await letTheAppAskAgain(page)
    await page.reload()
    await settle(page)
    await expect(page.getByRole('link', { name: 'Subscription' })).toHaveCount(0)

    await page.goto('/settings/subscription')
    await page.waitForURL((url) => url.pathname === '/settings', { timeout: 15_000 })
  })

  test('shows it again once the site accepts the app', async ({ page }) => {
    await setTorqvoiceComLinked(true)
    await page.goto('/settings')
    await settle(page)
    await letTheAppAskAgain(page)
    await page.reload()
    await settle(page)
    await expect(page.getByRole('link', { name: 'Subscription' })).toBeVisible()
  })
})

test.describe('buying a plan', () => {
  test('hands the buyer to torqvoice.com with a signed checkout link', async ({ page }) => {
    await page.goto('/settings/subscription')
    await settle(page)
    await expect(page.getByText('You will be taken to torqvoice.com')).toBeVisible()

    await page.getByRole('button', { name: /Upgrade to Pro/ }).click()
    await page.waitForURL(`${torqvoiceComUrl()}/checkout?**`, { timeout: 30_000 })

    // The stand-in only renders this page for a token it could verify.
    await expect(page.getByRole('heading', { name: 'Stand-in checkout' })).toBeVisible()
    await expect(page.getByTestId('org')).toHaveText(organizationId)
    await expect(page.getByTestId('plan')).toHaveText('pro')
    await expect(page.getByTestId('email')).toHaveText(EMAIL)
    await expect(page.getByTestId('appUrl')).toHaveText(/^http/)
  })

  test('names this app as the origin of the purchase', async ({ page, baseURL }) => {
    await page.goto('/settings/subscription')
    await settle(page)
    await page
      .getByRole('button', { name: /Enterprise/ })
      .first()
      .click()
    await page.waitForURL(`${torqvoiceComUrl()}/checkout?**`, { timeout: 30_000 })
    await expect(page.getByTestId('plan')).toHaveText('enterprise')
    await expect(page.getByTestId('appUrl')).toHaveText(new URL(baseURL ?? '').origin)
  })
})

test.describe('managing a bought plan', () => {
  test.beforeAll(async () => {
    planId = await giveProPlan(organizationId, {
      subscriptionId: `sub_e2e_${stamp}`,
      customerId: `cus_e2e_${stamp}`,
    })
  })

  test('opens the billing portal through torqvoice.com', async ({ page, baseURL }) => {
    await clearTorqvoiceComCalls()
    await page.goto('/settings/subscription')
    await settle(page)
    await page.getByRole('button', { name: 'Manage Billing' }).click()
    await page.waitForURL(`${torqvoiceComUrl()}/portal/**`, { timeout: 30_000 })
    await expect(page.getByTestId('org')).toHaveText(organizationId)

    const { calls } = await torqvoiceComState()
    const portal = calls.find((c) => c.path === 'portal')
    expect(portal, 'the app asked torqvoice.com for the portal').toBeTruthy()
    expect(portal?.authorized).toBe(true)
    expect(portal?.body).toMatchObject({
      organizationId,
      appUrl: new URL(baseURL ?? '').origin,
    })
  })

  test('opens the account on torqvoice.com signed in as this person', async ({ page }) => {
    await page.goto('/settings/subscription')
    await settle(page)
    await page.getByRole('button', { name: 'Open your account on torqvoice.com' }).click()
    await page.waitForURL(`${torqvoiceComUrl()}/api/auth/sso/app-link?**`, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Stand-in account' })).toBeVisible()
    await expect(page.getByTestId('email')).toHaveText(EMAIL)
    // Signed up with a password and never verified: the site is told so.
    await expect(page.getByTestId('emailVerified')).toHaveText('false')
  })

  test('cancels and resumes through torqvoice.com', async ({ page }) => {
    await clearTorqvoiceComCalls()
    await page.goto('/settings/subscription')
    await settle(page)
    await page.getByRole('button', { name: 'Cancel Subscription' }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Yes, Cancel' }).click()
    await expect(page.getByText('Subscription will cancel at end of billing period')).toBeVisible()

    let { calls } = await torqvoiceComState()
    expect(calls.find((c) => c.path === 'cancel')?.body).toMatchObject({ organizationId })

    // The stand-in writes nothing to the database, so the row is flagged the
    // way the real site would have flagged it, and the resume is exercised.
    await setCancelAtPeriodEnd(organizationId, true)
    await page.reload()
    await settle(page)
    await page.getByRole('button', { name: 'Resume Subscription' }).click()
    await expect(page.getByText('Subscription resumed successfully')).toBeVisible()
    ;({ calls } = await torqvoiceComState())
    expect(calls.find((c) => c.path === 'resume')?.body).toMatchObject({ organizationId })
    await setCancelAtPeriodEnd(organizationId, false)
  })

  test('shows the site refusing the app as a temporary failure, not as a lost session', async ({
    page,
  }) => {
    await setTorqvoiceComLinked(false)
    try {
      await page.goto('/settings/subscription')
      await settle(page)
      await page.getByRole('button', { name: 'Manage Billing' }).click()
      await expect(page.getByText('Billing is temporarily unavailable')).toBeVisible()
      await expect(page).toHaveURL(/\/settings\/subscription/)
    } finally {
      await setTorqvoiceComLinked(true)
    }
  })
})
