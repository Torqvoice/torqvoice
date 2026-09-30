import { expect, type Page, test } from '@playwright/test'
import { linkIn, waitForMail } from '../../support/mail'

/**
 * How people arrive: a stranger, and a colleague who was invited into the
 * workshop that exists.
 *
 * A self-hosted install runs one workshop, so the stranger does not open a
 * second one: they are told to ask its owner for an invitation
 * (single-workshop.spec.ts holds the rest of that). The colleague's path is
 * the one that matters on such an install.
 *
 * Both start signed out. The colleague follows the link out of the invitation
 * mail itself, caught by the harness's mail sink, so the address the app
 * writes into that mail is under test as much as the sign-up page is.
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

test('a new account reaches onboarding, where the install says it has its workshop', async ({
  page,
}) => {
  await page.goto('/auth/sign-up')
  await fillSignUp(page, 'E2E Founder', `e2e-founder-${stamp}@example.com`, `E2e-pass-${stamp}`)

  await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
  await expect(
    page.getByRole('heading', { name: 'This installation already has its workshop' })
  ).toBeVisible()
})

test('an invited colleague signs up straight into the workshop', async ({ page, browser }) => {
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

  // The invitation is a mail with a link in it, and nothing else. An app that
  // records the invitation but posts a link nobody can follow has failed at
  // the only part the colleague ever sees.
  const invitation = await waitForMail(invitee)
  const link = linkIn(invitation, /\/auth\/sign-up\?invite=/)

  await page.goto(link)
  await fillSignUp(page, 'E2E Colleague', invitee, `E2e-pass-${stamp}`)

  // No onboarding: they land in the workshop that invited them.
  await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
  await expect(page.getByText('Demo Auto Workshop').first()).toBeVisible()
})
