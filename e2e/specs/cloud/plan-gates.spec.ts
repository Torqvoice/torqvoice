import { expect, test } from '@playwright/test'
import { completeOnboarding, expectUpgradeOffered, signUpWithPassword } from '../../support/cloud'
import {
  customerRows,
  giveProPlan,
  insertCustomers,
  organizationIdFor,
  removePlan,
  teamInvitations,
  userIdFor,
  vehicleRows,
} from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * What the free plan allows, and what happens at its edge.
 *
 * Only in cloud mode: a self-hosted install has every feature, which is why
 * the rest of the suite never reaches a limit. Two things are pinned here.
 * The limit counts what the workshop made and not the sample data onboarding
 * seeds, because counted, the samples ate three of the old five slots and a
 * new workshop was refused on its third real customer. And reaching a limit
 * offers an upgrade rather than an error: a red "Customer limit reached" with
 * no way forward is how a workshop that was ready to pay left instead.
 *
 * A workshop of its own is opened here by signing up, so nothing about the
 * seeded one changes.
 */

// Signing up and onboarding a workshop in a hook takes longer than a test.
test.describe.configure({ mode: 'serial', timeout: 180_000 })

const stamp = Date.now()
const EMAIL = `e2e-free-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`
const WORKSHOP = `E2E Free Garage ${stamp}`
const STATE = `e2e/.auth/cloud-free-${stamp}.json`
/** The free plan's customer allowance, from PLAN_FEATURES.free in src/lib/features.ts. */
const FREE_CUSTOMERS = 20

let organizationId = ''
let planId = ''

test.use({ storageState: STATE })

test.beforeAll(async ({ browser }) => {
  // Signed up the way a stranger does, sample data and all, and the session
  // kept for the tests below.
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const page = await context.newPage()
  await signUpWithPassword(page, { name: 'E2E Free Owner', email: EMAIL, password: PASSWORD })
  await completeOnboarding(page, WORKSHOP, { sampleData: true })
  await context.storageState({ path: STATE })
  await context.close()

  organizationId = await organizationIdFor(EMAIL)
})

test.afterAll(async () => {
  if (planId) await removePlan(organizationId, planId)
})

/** Opens the customer form and saves a customer with just a name. */
async function addCustomer(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.goto('/customers')
  await settle(page)
  const dialog = page.getByRole('dialog', { name: 'Add New Customer' })
  await expect(async () => {
    await page
      .getByRole('button', { name: 'Add Customer' })
      .filter({ visible: true })
      .first()
      .click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await dialog.locator('#name').fill(name)
  await dialog.locator('button[type="submit"]').click()
}

test.describe('the free plan', () => {
  test('counts only the customers the workshop made, not the samples', async ({ page }) => {
    // Onboarding seeded its sample customers. Real ones up to one short of
    // the allowance go in directly; the last one goes through the form.
    const samples = await customerRows(organizationId)
    expect(samples, 'onboarding left sample customers to look around with').toBeGreaterThan(0)
    await insertCustomers(organizationId, await userIdFor(EMAIL), FREE_CUSTOMERS - 1, 'E2E Real')

    // Twenty real customers is inside the plan, however many rows the
    // samples add on top.
    await addCustomer(page, `E2E Twentieth ${stamp}`)
    await expect(page.getByText('Customer created')).toBeVisible({ timeout: 30_000 })
    expect(await customerRows(organizationId)).toBe(samples + FREE_CUSTOMERS)
  })

  test('offers an upgrade at the customer after that, instead of an error', async ({ page }) => {
    const before = await customerRows(organizationId)

    await addCustomer(page, `E2E Twenty-first ${stamp}`)
    await expectUpgradeOffered(page, new RegExp(`up to ${FREE_CUSTOMERS} customers`))

    // Refused on the server, not just hidden: nothing was written.
    expect(await customerRows(organizationId)).toBe(before)
    await expect(page.getByText('Failed to save customer')).toHaveCount(0)
  })

  test('offers the same upgrade when a new work order creates the customer', async ({ page }) => {
    // The flow the getting-started checklist sends a new workshop to: vehicle,
    // customer and job from one dialog. Still at the limit, the customer is
    // refused, and with it the vehicle that would have belonged to them.
    const customers = await customerRows(organizationId)
    const vehicles = await vehicleRows(organizationId)

    await page.goto('/work-orders?new=1')
    await settle(page)
    await expect(async () => {
      await page
        .getByRole('dialog', { name: 'Select Vehicle' })
        .getByRole('button', { name: 'Add New Vehicle' })
        .first()
        .click()
      await expect(page.locator('#new-make')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await page.locator('#new-make').fill('Volvo')
    await page.locator('#new-model').fill('V70')
    await page.locator('#new-year').fill('2015')
    await page.getByRole('combobox').filter({ hasText: 'Select a customer (optional)' }).click()
    await page.getByRole('option', { name: 'Create new customer' }).click()
    await page.locator('#new-customer-name').fill(`E2E Work order customer ${stamp}`)
    await page.getByRole('button', { name: 'Create & Continue' }).click()

    await expectUpgradeOffered(page, new RegExp(`up to ${FREE_CUSTOMERS} customers`))
    expect(await customerRows(organizationId), 'no customer written').toBe(customers)
    expect(await vehicleRows(organizationId), 'and no vehicle without an owner').toBe(vehicles)
    // Not taken on to a work order that has nobody to belong to.
    await expect(page).toHaveURL(/\/work-orders/)
  })

  test('offers an upgrade when inviting a colleague', async ({ page }) => {
    // The free plan is one person, so the first invitation is the limit.
    await page.goto('/settings/team')
    await settle(page)
    await expect(async () => {
      await page.getByRole('button', { name: 'Add', exact: true }).first().click()
      await expect(page.getByText('Someone in the office')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByText('Someone in the office').click()
    await page.locator('#member-email').fill(`e2e-colleague-${stamp}@example.com`)
    await page.getByRole('button', { name: 'Invite', exact: true }).click()

    await expectUpgradeOffered(page, /one team member/)
    expect(await teamInvitations(organizationId), 'no invitation went out').toBe(0)
  })

  test('keeps online payments locked, with the way to a plan', async ({ page }) => {
    // One of the settings pages gated by feature rather than by count: the
    // notice names Stripe and points at the plans, and the connection behind
    // it cannot be set up.
    await page.goto('/settings/integrations/stripe')
    await settle(page)

    await expect(page.getByText('Subscription required')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Stripe' })).toBeVisible()
    // In terms of payments, not the calendars and video calls other
    // integrations are about.
    await expect(page.getByText(/pay their invoices online/)).toBeVisible()
    await expect(page.getByText(/calendars, video calls/)).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'View plans' })).toHaveAttribute(
      'href',
      '/settings/subscription'
    )
    // Nothing to type keys into, in front of the notice or behind it.
    await expect(page.locator('input[name="stripe-secretKey"]')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toHaveCount(0)
  })
})

test.describe('a paid plan', () => {
  test('is not stopped where the free plan was', async ({ page }) => {
    planId = await giveProPlan(organizationId)
    const before = await customerRows(organizationId)

    await addCustomer(page, `E2E On Pro ${stamp}`)
    await expect(page.getByText('Customer created')).toBeVisible({ timeout: 30_000 })
    expect(await customerRows(organizationId)).toBe(before + 1)
  })

  test('opens online payments for connecting', async ({ page }) => {
    await page.goto('/settings/integrations/stripe')
    await settle(page)

    await expect(page.locator('input[name="stripe-secretKey"]')).toBeEditable({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeVisible()
    await expect(page.getByText('Subscription required')).toHaveCount(0)
  })
})
