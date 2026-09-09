import { expect, type Page, test } from '@playwright/test'
import { latestInvitationToken } from '../../support/db'

/**
 * How people arrive: a stranger who opens a workshop of their own, and a
 * colleague who was invited into one that exists.
 *
 * Both start signed out. The invitation is read from the database, since
 * the test environment delivers no mail.
 */

test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()

async function fillSignUp(page: Page, name: string, email: string, password: string) {
  await page.locator('#name').fill(name)
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('#terms').click()
  await page.getByRole('button', { name: /create account/i }).click()
}

test('a new account is walked through onboarding into a workshop of its own', async ({ page }) => {
  await page.goto('/auth/sign-up')
  await fillSignUp(page, 'E2E Founder', `e2e-founder-${stamp}@example.com`, `E2e-pass-${stamp}`)

  await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  await page.locator('#workshopName').fill(`E2E Garage ${stamp}`)
  await page.locator('form button[type="submit"]').click()

  await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
  await expect(page.getByText(`E2E Garage ${stamp}`).first()).toBeVisible()
})

test('an invited colleague signs up straight into the workshop', async ({ page, browser }) => {
  // The app refuses to record an invitation it cannot mail, and the test
  // environment has no mail provider yet. Needs a mail sink in the harness.
  test.fixme(true, 'no mail sink in the e2e environment')
  const invitee = `e2e-colleague-${stamp}@example.com`

  // The owner sends the invitation from the team page.
  const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
  const ownerPage = await owner.newPage()
  await ownerPage.goto('/settings/team')
  await ownerPage.getByRole('button', { name: 'Add', exact: true }).click()
  await ownerPage.getByText('Someone in the office').click()
  await ownerPage.locator('#member-email').fill(invitee)
  await ownerPage.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(ownerPage.getByText(invitee).first()).toBeVisible()
  await owner.close()

  const token = await latestInvitationToken(invitee)
  expect(token, 'an invitation was recorded for the address').not.toBeNull()

  // The colleague follows the mailed link.
  await page.goto(`/auth/sign-up?invite=${encodeURIComponent(token as string)}`)
  await fillSignUp(page, 'E2E Colleague', invitee, `E2e-pass-${stamp}`)

  // No onboarding: they land in the workshop that invited them.
  await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
  await expect(page.getByText('Demo Auto Workshop').first()).toBeVisible()
})
