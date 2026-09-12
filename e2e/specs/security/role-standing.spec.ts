import { expect, type Browser, type Page, test } from '@playwright/test'
import {
  createAdminRole,
  createRoleWithEveryPermission,
  deleteRoles,
  membershipOf,
  ownerOrganizationId,
  setMembership,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { linkIn, waitForMail } from '../../support/mail'

/**
 * Who may make somebody an admin.
 *
 * Inviting as admin is the owner's alone, and so is changing a member's
 * built-in role on the team page. The role picker's own action asked only
 * for admin standing, which a custom role can carry, so a person with such a
 * role could make themself, or anyone, a built-in admin, and from there edit
 * roles and remove members. The team page never offered them the picker; the
 * action behind it is what a browser can call, and what this file calls.
 *
 * The action's id is not written down anywhere a test could read it, so it is
 * taken from the request the owner's own click makes, and replayed with the
 * arguments of the caller's choosing, as a person in the browser could.
 */

test.describe.configure({ mode: 'serial' })

// Everybody starts as a stranger with no session.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const COLLEAGUE = `e2e-standing-${stamp}@example.com`
const PEER = `e2e-peer-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`

const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100'

let organizationId = ''
let adminRoleId = ''
let plainRoleId = ''
/** The `Next-Action` id of assignRole, learnt from the owner's click. */
let assignRoleAction = ''

async function signIn(page: Page, email: string) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

/** The owner invites `email`, who signs up from the mail and lands in the workshop. */
async function joinTeam(browser: Browser, email: string, name: string) {
  const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
  const page = await owner.newPage()
  await page.goto('/settings/team')
  await settle(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Add', exact: true }).first().click()
    await expect(page.getByText('Someone in the office')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByText('Someone in the office').click()
  await page.locator('#member-email').fill(email)
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByText(email).first()).toBeVisible({ timeout: 30_000 })
  await owner.close()

  const invitation = await waitForMail(email)
  const person = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const signup = await person.newPage()
  await signup.goto(linkIn(invitation, /\/auth\/sign-up\?invite=/))
  await signup.locator('#name').fill(name)
  await signup.locator('#email').fill(email)
  await signup.locator('#password').fill(PASSWORD)
  await signup.locator('#terms').click()
  await signup.getByRole('button', { name: /create account/i }).click()
  await signup.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), {
    timeout: 30_000,
  })
  await person.close()
}

/**
 * Calls assignRole the way the page does: a POST to the page it lives on,
 * with the action id in the `Next-Action` header and the arguments as the
 * body. What the page would do with the answer does not matter here; the
 * membership is read back from the database.
 */
async function callAssignRole(
  page: Page,
  args: { memberId: string; role: 'admin' | 'member'; roleId: string | null }
) {
  return page.request.post(`${baseURL}/settings/team`, {
    headers: {
      'next-action': assignRoleAction,
      'content-type': 'text/plain;charset=UTF-8',
      accept: 'text/x-component',
      origin: baseURL,
    },
    data: JSON.stringify([args]),
  })
}

test.beforeAll(async ({ browser }) => {
  organizationId = await ownerOrganizationId()
  await joinTeam(browser, COLLEAGUE, 'E2E Standing Colleague')
  await joinTeam(browser, PEER, 'E2E Peer')
  adminRoleId = await createAdminRole(organizationId, `E2E Admin Switch ${stamp}`)
  plainRoleId = await createRoleWithEveryPermission(organizationId, `E2E Plain ${stamp}`)
})

test.afterAll(async () => {
  // Two more ordinary members without a role, and the roles gone.
  if (organizationId) {
    for (const email of [COLLEAGUE, PEER]) {
      await setMembership(email, organizationId, { roleId: null, role: 'member' })
    }
  }
  await deleteRoles([adminRoleId, plainRoleId].filter(Boolean))
})

test.describe('the role picker’s action', () => {
  test('is learnt from the owner giving the peer a role', async ({ browser }) => {
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const page = await owner.newPage()
    await page.goto('/settings/team')
    await settle(page)

    // Members are bordered cards, one per person, each with its own picker.
    const row = page.locator('div.rounded-lg.border').filter({ hasText: PEER })
    const action = page.waitForRequest((request) => Boolean(request.headers()['next-action']))
    await row.getByRole('combobox').click()
    await page.getByRole('option', { name: `E2E Plain ${stamp}`, exact: true }).click()
    assignRoleAction = (await action).headers()['next-action']
    expect(assignRoleAction).toBeTruthy()

    await expect
      .poll(async () => (await membershipOf(PEER, organizationId)).roleId)
      .toBe(plainRoleId)
    await owner.close()
  })

  test('does not let a custom-role admin make themself or a peer a built-in admin', async ({
    page,
  }) => {
    await setMembership(COLLEAGUE, organizationId, { roleId: adminRoleId, role: 'member' })
    await signIn(page, COLLEAGUE)
    const self = await membershipOf(COLLEAGUE, organizationId)
    const peer = await membershipOf(PEER, organizationId)

    await callAssignRole(page, { memberId: self.id, role: 'admin', roleId: null })
    await callAssignRole(page, { memberId: peer.id, role: 'admin', roleId: null })

    expect((await membershipOf(COLLEAGUE, organizationId)).role).toBe('member')
    expect(await membershipOf(PEER, organizationId)).toEqual(peer)

    // The action itself still works for them: a role that grants nothing on
    // its own is theirs to hand out.
    await callAssignRole(page, { memberId: peer.id, role: 'member', roleId: null })
    expect((await membershipOf(PEER, organizationId)).roleId).toBeNull()
    await callAssignRole(page, { memberId: peer.id, role: 'member', roleId: plainRoleId })
    expect((await membershipOf(PEER, organizationId)).roleId).toBe(plainRoleId)
  })

  test('does not let a built-in admin make a peer a built-in admin, or unmake one', async ({
    page,
  }) => {
    await setMembership(COLLEAGUE, organizationId, { roleId: null, role: 'admin' })
    await signIn(page, COLLEAGUE)
    const peer = await membershipOf(PEER, organizationId)

    await callAssignRole(page, { memberId: peer.id, role: 'admin', roleId: null })
    expect((await membershipOf(PEER, organizationId)).role).toBe('member')

    // Made an admin by the owner, the peer is out of the colleague's reach.
    await setMembership(PEER, organizationId, { roleId: null, role: 'admin' })
    await callAssignRole(page, { memberId: peer.id, role: 'member', roleId: plainRoleId })
    expect(await membershipOf(PEER, organizationId)).toEqual({
      id: peer.id,
      role: 'admin',
      roleId: null,
    })
  })

  test('lets the owner do both', async ({ browser }) => {
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const page = await owner.newPage()
    await page.goto('/settings/team')
    const peer = await membershipOf(PEER, organizationId)

    await callAssignRole(page, { memberId: peer.id, role: 'member', roleId: plainRoleId })
    expect(await membershipOf(PEER, organizationId)).toEqual({
      id: peer.id,
      role: 'member',
      roleId: plainRoleId,
    })
    await callAssignRole(page, { memberId: peer.id, role: 'admin', roleId: null })
    expect((await membershipOf(PEER, organizationId)).role).toBe('admin')
    await owner.close()
  })
})
