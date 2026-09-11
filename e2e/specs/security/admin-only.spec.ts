import { expect, type Browser, type Page, test } from '@playwright/test'
import {
  contentCounts,
  createRoleWithEveryPermission,
  invitationTokenFor,
  ownerOrganizationId,
  setMembership,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { linkIn, waitForMail } from '../../support/mail'

/**
 * Logged in is not allowed.
 *
 * The September 2026 audit found a class of actions and routes that checked
 * for a session and a permission, and nothing more: any member could wipe the
 * workshop's records, export the whole organisation or replace it with an
 * empty backup, change the plan and charge the card, and a settings manager
 * could invite a second address of their own as admin. All of them are
 * owner-or-admin decisions now, whatever permissions a custom role carries.
 *
 * So a colleague is given a role with every permission the app knows and no
 * admin standing, which is the member every permission check waves through,
 * and is then pointed at each of those doors.
 */

test.describe.configure({ mode: 'serial' })

// The colleague starts as a stranger with no session.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const MANAGER = `e2e-manager-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`
const SECRET_INVITEE = `e2e-secret-${stamp}@example.com`
const ADMIN_INVITEE = `e2e-admin-${stamp}@example.com`
const MEMBER_INVITEE = `e2e-member-${stamp}@example.com`

let organizationId = ''
let roleId = ''

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

/**
 * Opens the team page's Add dialog and sends an invitation to `email` as
 * "someone in the office", optionally as an Admin. The dialog is left open so
 * the caller can read what it said.
 */
async function invite(page: Page, email: string, role?: 'Admin') {
  await page.goto('/settings/team')
  await settle(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await expect(page.getByText('Someone in the office')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByText('Someone in the office').click()
  await page.locator('#member-email').fill(email)
  if (role) {
    const dialog = page.getByRole('dialog').filter({ has: page.locator('#member-email') })
    await dialog.getByRole('combobox').click()
    await page.getByRole('option', { name: role, exact: true }).click()
  }
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
}

/** The owner invites an address and sees it listed as pending. */
async function ownerInvites(browser: Browser, email: string) {
  const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
  const page = await owner.newPage()
  await invite(page, email)
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 30_000 })
  await owner.close()
}

/** The API routes are written to, so the request carries the app's own origin. */
const sameOrigin = { origin: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100' }

test.afterAll(async () => {
  // The last test makes the manager an admin; the workshop is left with one
  // more ordinary member, not one more admin.
  if (organizationId && roleId) {
    await setMembership(MANAGER, organizationId, { roleId, role: 'member' })
  }
})

test.describe('a member with every permission and no admin standing', () => {
  test('is invited by the owner, signs up, and is given the role', async ({ page, browser }) => {
    await ownerInvites(browser, MANAGER)

    const invitation = await waitForMail(MANAGER)
    await page.goto(linkIn(invitation, /\/auth\/sign-up\?invite=/))
    await page.locator('#name').fill('E2E Settings Manager')
    await page.locator('#email').fill(MANAGER)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('#terms').click()
    await page.getByRole('button', { name: /create account/i }).click()
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })

    organizationId = await ownerOrganizationId()
    roleId = await createRoleWithEveryPermission(organizationId, `E2E Everything ${stamp}`)
    await setMembership(MANAGER, organizationId, { roleId, role: 'member' })

    // The role opens the whole application to them, which is what makes the
    // refusals below worth anything: they are not a roleless member being
    // turned away at the door.
    await signIn(page, MANAGER, PASSWORD)
    await page.goto('/settings/team')
    await expect(page.getByRole('heading', { name: 'No access yet' })).toHaveCount(0)
    await expect(page.getByText(MANAGER).first()).toBeVisible()
  })

  test('cannot export the workshop, or replace it from a backup', async ({ page }) => {
    await signIn(page, MANAGER, PASSWORD)

    for (const route of [
      'backup/export',
      'backup/import',
      'backup/import-lubelog',
      'backup/import-invoice-ninja',
    ]) {
      // Refused before the body is looked at: an import that got as far as
      // parsing would already be past the check that matters.
      const response = await page.request.post(`/api/protected/${route}`, {
        data: { version: 2, data: {} },
        headers: sameOrigin,
      })
      expect(response.status(), `${route} is refused`).toBe(403)
      expect(await response.json()).toEqual({ error: 'Forbidden' })
    }
  })

  test('cannot wipe the workshop’s records from the data page', async ({ page }) => {
    await signIn(page, MANAGER, PASSWORD)
    const before = await contentCounts(organizationId)

    // The page offers the button to anyone who can open it; the action is
    // what has to say no.
    await page.goto('/settings/data')
    await settle(page)
    const dialog = page.getByRole('dialog', { name: 'Delete Content' })
    await expect(async () => {
      await page.getByRole('button', { name: 'Delete Content', exact: true }).first().click()
      await expect(dialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    await dialog.getByRole('checkbox', { disabled: false }).first().click()
    await dialog.getByPlaceholder('delete my data').fill('delete my data')
    // The confirm button counts what it would delete: "Delete 1 selected".
    await dialog.getByRole('button', { name: /^Delete \d+ selected$/ }).click()

    await expect(page.getByText('Only an owner or admin can delete workshop content')).toBeVisible({
      timeout: 30_000,
    })
    expect(await contentCounts(organizationId), 'nothing was deleted').toEqual(before)
  })

  test('cannot change the plan or reach the card', async ({ page }) => {
    await signIn(page, MANAGER, PASSWORD)

    for (const route of ['upgrade', 'checkout', 'upgrade-preview', 'billing-portal']) {
      const response = await page.request.post(`/api/protected/subscription/${route}`, {
        data: { plan: 'enterprise' },
        headers: sameOrigin,
      })
      expect(response.status(), `${route} is refused`).toBe(403)
      expect(await response.json()).toEqual({ error: 'Forbidden' })
    }
  })

  test('is not offered a way to bring people in', async ({ page }) => {
    // Inviting is an admin's call, and the rule sits in the action
    // (`canInvite`, with its own unit tests). The page agrees with it: the
    // button is not there for a member, however wide their role.
    await signIn(page, MANAGER, PASSWORD)
    await page.goto('/settings/team')
    await settle(page)
    await expect(page.getByText(MANAGER).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
  })
})

test.describe('an invitation', () => {
  test('keeps its token in the invitee’s inbox and off the team page', async ({ browser }) => {
    // The token is the credential that lets whoever holds it join as the
    // invitee. It used to be returned to everyone who could read the team
    // page, which let a member read the token for the invited boss's address
    // and sign up with it.
    await ownerInvites(browser, SECRET_INVITEE)
    const token = await invitationTokenFor(SECRET_INVITEE, organizationId)
    expect(token, 'the invitation exists').toBeTruthy()

    const mail = await waitForMail(SECRET_INVITEE)
    expect(`${mail.html}\n${mail.text}`, 'the invitee is sent the token').toContain(token)

    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const html = await (await owner.request.get('/settings/team')).text()
    await owner.close()
    expect(html, 'the team page lists the invitation').toContain(SECRET_INVITEE)
    expect(html, 'without its token').not.toContain(token as string)
  })

  test('as admin can only come from the owner', async ({ page }) => {
    // The manager is made an admin: they may bring people in now, and may
    // still not hand out admin, which is how a settings manager once walked
    // in as one.
    await setMembership(MANAGER, organizationId, { roleId, role: 'admin' })
    await signIn(page, MANAGER, PASSWORD)

    await invite(page, ADMIN_INVITEE, 'Admin')
    await expect(page.getByText('Only the owner can invite admins')).toBeVisible({
      timeout: 30_000,
    })
    expect(await invitationTokenFor(ADMIN_INVITEE, organizationId), 'nothing was sent').toBeNull()

    await invite(page, MEMBER_INVITEE)
    await expect(page.getByText(MEMBER_INVITEE).first()).toBeVisible({ timeout: 30_000 })
    expect(await invitationTokenFor(MEMBER_INVITEE, organizationId)).toBeTruthy()
  })
})
