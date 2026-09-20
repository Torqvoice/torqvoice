import { expect, type Page, test } from '@playwright/test'
import {
  customFieldValue,
  deleteCustomFields,
  deletePersonWithEmail,
  forgetWorkshopSetting,
  membershipOf,
  ownerOrganizationId,
  permissionDenialsFor,
  plantCustomField,
  roleIdNamed,
  seededTenantFixtures,
  setWorkshopSetting,
  type TenantFixtures,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { linkIn, waitForMail } from '../../support/mail'
import { saveWorkOrder } from '../../support/work-order'

/**
 * The role the product hands somebody at the desk.
 *
 * Every other permission test in the suite covers an extreme: `roles.spec.ts`
 * has a member with no role refused everywhere, `admin-only.spec.ts` has a
 * member with every permission still kept out of the owner's screens, and the
 * other fifty specs run as the owner, who skips the permission check
 * altogether. Nothing signed in as the built-in Member role and used the
 * ordinary pages that role is allowed to open, and two bugs lived in the gap.
 * Both were silent: nineteen pages read the workshop's currency, units and tax
 * through a call that needs `read:settings`, were refused, and fell back to the
 * built-in defaults without a word, and a work order's custom fields needed the
 * Settings permission too, so a Member saw none of them.
 *
 * The guard below is therefore not "assert the currency". A workshop whose
 * currency is USD hides that bug, and a page that quietly substitutes a
 * default never turns red. It is: using the pages this role may use writes no
 * `auth.permissionDenied` row. A refusal on a page the role is meant to reach
 * is, by definition, a page asking for something the role does not carry,
 * whatever the missing permission turns out to be.
 *
 * Two narrow checks of what the person actually sees sit on top of it, because
 * an audit table is not a user.
 */

test.describe.configure({ mode: 'serial' })

// The colleague starts as a stranger with no session.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const MEMBER = `e2e-member-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`
const FIELD_LABEL = `E2E Paint code ${stamp}`
const CURRENCY_KEY = 'workshop.currencyCode'

/**
 * A currency that cannot be mistaken for the built-in fallback. `USD` is what
 * every page substitutes when the read is refused, so a workshop on USD proves
 * nothing; NOK prints "kr" and never "$".
 */
const CURRENCY = 'NOK'

let organizationId = ''
let fixtures: TenantFixtures
let memberRoleId: string | null = null
let currencyBefore: string | null = null
let currencyChanged = false
const plantedFields: string[] = []

async function signInAsMember(page: Page) {
  // The sign-in page sends anyone with a session straight on, so a fresh
  // sign-in has to drop the old cookie first.
  await page.context().clearCookies()
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(MEMBER)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

test.afterAll(async () => {
  // The workshop is left exactly as it was found: the currency back, the
  // planted field and its values gone, the colleague gone. The Member role
  // itself stays, because the product made it through its own button and it
  // is the workshop's now.
  if (currencyChanged) {
    if (currencyBefore === null) await forgetWorkshopSetting(organizationId, CURRENCY_KEY)
    else await setWorkshopSetting(organizationId, CURRENCY_KEY, currencyBefore)
  }
  await deleteCustomFields(plantedFields)
  await deletePersonWithEmail(MEMBER)
})

test.describe('the built-in Member role', () => {
  test('is invited with the workshop’s own Member role, and signs up from the mail', async ({
    page,
    browser,
  }) => {
    organizationId = await ownerOrganizationId()
    fixtures = await seededTenantFixtures()

    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const ownerPage = await owner.newPage()
    await ownerPage.goto('/settings/team')
    await settle(ownerPage)

    // The role has to be the one the app makes, not one assembled here: a
    // permission list written in a test keeps passing after the real role
    // changes underneath it. The team page offers to create the standard roles
    // while either is missing, which is the path a workshop really takes.
    const createRoles = ownerPage.getByRole('button', { name: 'Create the standard roles' })
    if (await createRoles.isVisible().catch(() => false)) {
      await createRoles.click()
      await expect(ownerPage.getByText('Standard roles created')).toBeVisible({ timeout: 30_000 })
    }
    memberRoleId = await roleIdNamed(organizationId, 'Member')
    expect(memberRoleId, 'the workshop has the built-in Member role').toBeTruthy()

    await expect(async () => {
      await ownerPage.getByRole('button', { name: 'Add', exact: true }).first().click()
      await expect(ownerPage.getByText('Someone in the office')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await ownerPage.getByText('Someone in the office').click()
    await ownerPage.locator('#member-email').fill(MEMBER)

    const dialog = ownerPage.getByRole('dialog').filter({ has: ownerPage.locator('#member-email') })
    await dialog.getByRole('combobox').click()
    await ownerPage.getByRole('option', { name: 'Member', exact: true }).click()
    await ownerPage.getByRole('button', { name: 'Invite', exact: true }).click()
    await expect(ownerPage.getByText(MEMBER).first()).toBeVisible({ timeout: 30_000 })
    await owner.close()

    const invitation = await waitForMail(MEMBER)
    await page.goto(linkIn(invitation, /\/auth\/sign-up\?invite=/))
    await page.locator('#name').fill('E2E Desk Colleague')
    await page.locator('#email').fill(MEMBER)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('#terms').click()
    await page.getByRole('button', { name: /create account/i }).click()

    // Inside the app, not at the door and not in onboarding: they joined a
    // workshop that already exists.
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'No access yet' })).toHaveCount(0)

    // And they carry the built-in role, not an accidental blank membership.
    const membership = await membershipOf(MEMBER, organizationId)
    expect(membership.roleId).toBe(memberRoleId)
    expect(membership.role).toBe('member')
  })

  test('is refused nothing on any page the role is meant to open', async ({ page }) => {
    await signInAsMember(page)

    /**
     * Every page the Member role carries a permission for. Deliberately absent:
     * settings, billing, reports, inspections and the tire hotel, which this
     * role is meant to be refused and which the last test pins.
     */
    const pages: { url: string; shows: (page: Page) => Promise<void> }[] = [
      { url: '/', shows: (p) => expect(p.getByText('Dashboard').first()).toBeVisible() },
      {
        url: '/work-orders',
        shows: (p) => expect(p.getByText('All Work Orders').first()).toBeVisible(),
      },
      { url: '/vehicles', shows: (p) => expect(p.getByText('All Vehicles').first()).toBeVisible() },
      {
        url: `/vehicles/${fixtures.vehicleId}`,
        // A page that rendered its own record, not an empty shell.
        shows: (p) => expect(p.getByText(fixtures.vehiclePlate).first()).toBeVisible(),
      },
      {
        url: `/vehicles/${fixtures.vehicleId}/service/${fixtures.serviceRecordId}`,
        shows: (p) => expect(p.getByTestId('totals')).toBeVisible(),
      },
      {
        url: '/customers',
        shows: (p) => expect(p.getByText('All Customers').first()).toBeVisible(),
      },
      {
        url: `/customers/${fixtures.customerId}`,
        shows: (p) => expect(p.getByText(fixtures.customerName).first()).toBeVisible(),
      },
      { url: '/quotes', shows: (p) => expect(p.getByText('All Quotes').first()).toBeVisible() },
      {
        url: `/quotes/${fixtures.quoteId}`,
        shows: (p) => expect(p.getByText(fixtures.quoteNumber).first()).toBeVisible(),
      },
      { url: '/inventory', shows: (p) => expect(p.getByText('All Parts').first()).toBeVisible() },
      {
        url: '/labor-presets',
        shows: (p) => expect(p.getByText('Labor Presets').first()).toBeVisible(),
      },
      { url: '/work-board', shows: (p) => expect(p.getByText('Work Board').first()).toBeVisible() },
      {
        url: '/calendar',
        shows: (p) => expect(p.getByRole('button', { name: 'Today' }).first()).toBeVisible(),
      },
    ]

    // A second either side: the audit write is fire-and-forget, and the clock
    // here is not the clock the row is stamped with.
    const since = new Date(Date.now() - 1_000)
    const refusals: string[] = []
    let counted = 0

    for (const { url, shows } of pages) {
      await page.goto(url)
      await settle(page)

      // The refusal screen, an error boundary or an empty shell all mean the
      // page did not open, and would leave the audit log innocently empty.
      await expect(
        page.getByRole('heading', { name: 'No access yet' }),
        `${url} opens`
      ).toHaveCount(0)
      await shows(page)

      await page.waitForTimeout(2_000)
      const all = await permissionDenialsFor(MEMBER, since)
      // Attributed to the page that was open when they appeared, which is what
      // makes a failure here readable rather than a list of bare messages.
      for (const message of all.slice(counted)) refusals.push(`${url} -> ${message}`)
      counted = all.length
    }

    expect(
      refusals,
      'a page this role may open asked for a permission the role does not carry'
    ).toEqual([])
  })

  test('sees the workshop’s own currency, not the built-in default', async ({ page, browser }) => {
    currencyBefore = await setWorkshopSetting(organizationId, CURRENCY_KEY, CURRENCY)
    currencyChanged = true

    const jobUrl = `/vehicles/${fixtures.vehicleId}/service/${fixtures.serviceRecordId}`

    // What the owner sees is the workshop's own answer, whatever the app's
    // formatting happens to be. The Member has to see the same thing rather
    // than a shape this test decided on.
    const owner = await browser.newContext({ storageState: 'e2e/.auth/owner.json' })
    const ownerPage = await owner.newPage()
    await ownerPage.goto(jobUrl)
    await settle(ownerPage)
    const ownersTotals = (await ownerPage.getByTestId('totals').innerText()).trim()
    await owner.close()

    expect(ownersTotals, 'the workshop is on NOK for this test').toContain('kr')

    await signInAsMember(page)
    await page.goto(jobUrl)
    await settle(page)
    const membersTotals = (await page.getByTestId('totals').innerText()).trim()

    expect(membersTotals).toBe(ownersTotals)
    // Said plainly as well, because the comparison above would pass if both
    // sides broke together.
    expect(membersTotals).toContain('kr')
    expect(membersTotals).not.toContain('$')
    expect(membersTotals).not.toContain('USD')

    // And on a list, which reads the currency through the same call.
    await page.goto('/work-orders')
    await settle(page)
    const list = await page.getByRole('table').first().innerText()
    expect(list).not.toContain('$')
  })

  test('sees a custom field on a work order, fills it in, and it stays', async ({ page }) => {
    const fieldId = await plantCustomField(organizationId, 'service_record', FIELD_LABEL)
    plantedFields.push(fieldId)

    await signInAsMember(page)
    const jobUrl = `/vehicles/${fixtures.vehicleId}/service/${fixtures.serviceRecordId}`
    await page.goto(jobUrl)
    await settle(page)

    // The label is the whole point: a Member used to see no custom fields at
    // all, so the workshop's own question never reached the person answering it.
    const field = page.getByTestId(`custom-field-${fieldId}`)
    await expect(field).toBeVisible()
    await expect(field.getByText(FIELD_LABEL)).toBeVisible()

    const value = `LY9C ${stamp}`
    const input = field.getByRole('textbox')
    await expect(async () => {
      await input.fill(value)
      await expect(input).toHaveValue(value)
    }).toPass({ timeout: 30_000 })

    await saveWorkOrder(page)

    // Read back from the database as well as the page: the save used to be
    // refused outright, and an input keeps what was typed into it either way.
    await expect(async () => {
      expect(await customFieldValue(fieldId, fixtures.serviceRecordId)).toBe(value)
    }).toPass({ timeout: 30_000 })

    await page.goto(jobUrl)
    await settle(page)
    await expect(page.getByTestId(`custom-field-${fieldId}`).getByRole('textbox')).toHaveValue(
      value
    )
  })

  test('is still kept out of the workshop’s settings', async ({ page }) => {
    // The other half of the rule, and the guard against widening the role to
    // make the first test pass: this table holds payment secrets, API keys and
    // the licence token, and none of it is a Member's business.
    await signInAsMember(page)

    for (const url of ['/settings', '/settings/company']) {
      await page.goto(url)
      await settle(page)
      await expect(page, `${url} is refused`).not.toHaveURL(new RegExp(`${url}$`))
    }
  })
})
