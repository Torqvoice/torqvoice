import { expect, type Page, test } from '@playwright/test'
import { linkIn, waitForMail } from '../../support/mail'
import { settle } from '../../support/hydration'

/**
 * What a role grants, and what it does not.
 *
 * A member's permissions come from the role they were given, and a member
 * given none "cannot do anything" — the team page says so in as many words.
 * That promise is worth a test, because the failure mode is silent in both
 * directions: a member who can reach the billing page can also change what
 * the workshop pays, and a member who can reach nothing sees a product that
 * looks broken rather than one that is waiting for an admin.
 *
 * The invitation goes out through the harness's mail sink, so the colleague
 * arrives the way a real one does: by following a link they were sent.
 */

test.describe.configure({ mode: 'serial' })

// The colleague starts as a stranger with no session.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const COLLEAGUE = `e2e-roleless-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`

async function signInAsColleague(page: Page) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(COLLEAGUE)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

test.describe('a member with no role', () => {
  test('is invited by the owner and signs up from the mail', async ({ page, browser }) => {
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const ownerPage = await owner.newPage()
    await ownerPage.goto('/settings/team')
    await settle(ownerPage)

    // "Someone in the office": invited by email, picks their own password, and
    // is given no role, which the dialog warns leaves them unable to do
    // anything until an admin says otherwise.
    await expect(async () => {
      await ownerPage.getByRole('button', { name: 'Add', exact: true }).first().click()
      await expect(ownerPage.getByText('Someone in the office')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await ownerPage.getByText('Someone in the office').click()
    await ownerPage.locator('#member-email').fill(COLLEAGUE)
    await ownerPage.getByRole('button', { name: 'Invite', exact: true }).click()
    await expect(ownerPage.getByText(COLLEAGUE).first()).toBeVisible({ timeout: 30_000 })
    await owner.close()

    const invitation = await waitForMail(COLLEAGUE)
    await page.goto(linkIn(invitation, /\/auth\/sign-up\?invite=/))
    await page.locator('#name').fill('E2E Roleless Colleague')
    await page.locator('#email').fill(COLLEAGUE)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('#terms').click()
    await page.getByRole('button', { name: /create account/i }).click()

    // No onboarding: they joined a workshop that already exists.
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
  })

  test('is told so, once and plainly, instead of a sidebar of refusals', async ({ page }) => {
    await signInAsColleague(page)

    // The whole application used to open, with every page inside it answering
    // "your role does not allow this" one at a time.
    await expect(page.getByRole('heading', { name: 'No access yet' })).toBeVisible()
    await expect(page.getByText(/Demo Auto Workshop/)).toBeVisible()
    // And it names who can fix it, because the reader cannot.
    await expect(page.getByText(/ask an owner or an admin/i)).toBeVisible()
  })

  test('reaches none of the workshop’s screens by their addresses', async ({ page }) => {
    await signInAsColleague(page)

    for (const url of ['/work-orders', '/customers', '/billing', '/settings/team', '/inventory']) {
      await page.goto(url)
      // The same one screen, wherever they point the browser.
      await expect(
        page.getByRole('heading', { name: 'No access yet' }),
        `${url} is refused`
      ).toBeVisible()
    }
  })

  test('can sign out from where they are', async ({ page }) => {
    // The only thing the screen offers, and the only thing they can do: an
    // account with nowhere to go still has to be able to leave.
    await signInAsColleague(page)
    await page.getByRole('button', { name: /sign out/i }).click()
    await expect(page).toHaveURL(/\/auth\/sign-in/, { timeout: 30_000 })
  })

  test('the owner is not affected by any of it', async ({ browser }) => {
    // The other half of the rule: the pages refused above are refused because
    // of the role, not because they are broken.
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const ownerPage = await owner.newPage()
    for (const url of ['/work-orders', '/billing', '/settings/team']) {
      await ownerPage.goto(url)
      await expect(
        ownerPage.getByRole('heading', { name: 'No access yet' }),
        `${url} opens for the owner`
      ).toHaveCount(0)
    }
    await owner.close()
  })
})
