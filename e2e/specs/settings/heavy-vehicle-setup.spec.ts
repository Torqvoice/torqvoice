import { expect, test } from '@playwright/test'
import { Client } from 'pg'
import { ownerOrganizationId } from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * The fleet and heavy vehicle setup checklist, with every piece assembled.
 *
 * A workshop that never asked for it sees nothing of it but one line at the
 * foot of Settings, Custom Fields. Asked for from the search palette, it opens
 * on that page, says which of the five parts are on and links straight to
 * each; turning one on shows on the list; put away, it is gone, and the line
 * at the foot of the page brings it back.
 */

test.describe.configure({ mode: 'serial' })

const KEY = 'setup.heavyVehiclesCard'

async function forgetCard(): Promise<void> {
  const organizationId = await ownerOrganizationId()
  const url = process.env.E2E_DATABASE_URL
  if (!url) throw new Error('E2E_DATABASE_URL is not set. See e2e/README.md.')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    // The checklist, and the one switch this spec turns on: off is how the
    // rest of the suite expects the workshop.
    await db.query(
      `delete from app_settings where "organizationId" = $1 and key = any($2::text[])`,
      [organizationId, [KEY, 'documents.customerReferenceEnabled']]
    )
  } finally {
    await db.end()
  }
}

test.beforeAll(forgetCard)
test.afterAll(forgetCard)

test('a workshop that has not asked sees only the line at the foot of the page', async ({
  page,
}) => {
  await page.goto('/settings/invoice?tab=customFields')
  await settle(page)
  await expect(page.getByTestId('heavy-vehicle-setup')).toHaveCount(0)
  await expect(page.getByTestId('heavy-vehicle-setup-link')).toBeVisible()
  await page.goto('/')
  await settle(page)
  await expect(page.getByTestId('heavy-vehicle-setup')).toHaveCount(0)
})

test('the search palette opens it on Settings, Custom Fields', async ({ page }) => {
  await page.goto('/vehicles')
  await settle(page)
  const input = page.getByPlaceholder('Search customers, plates, invoices, settings…')
  await expect(async () => {
    await page.keyboard.press('Control+k')
    await expect(input).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await input.fill('heavy vehicles')
  await page.getByRole('option', { name: /Set up for fleets and heavy vehicles/ }).click()
  await page.waitForURL(/\/settings\/invoice\?tab=customFields/)
  const card = page.getByTestId('heavy-vehicle-setup')
  await expect(card).toBeVisible({ timeout: 30_000 })
  await expect(card.getByRole('link', { name: /Meters/ })).toHaveAttribute(
    'href',
    '/settings/invoice?tab=customFields#meters'
  )
  await expect(card.getByRole('link', { name: /guide/ })).toHaveAttribute(
    'href',
    'https://torqvoice.com/docs/heavy-vehicles'
  )
  // While it is open, the line that opens it is not there.
  await expect(page.getByTestId('heavy-vehicle-setup-link')).toHaveCount(0)
})

test('a step turned on shows as on', async ({ page }) => {
  await page.goto('/settings/invoice?tab=customFields')
  await settle(page)
  const step = page.getByTestId('heavy-vehicle-step-reference')
  await expect(step).toContainText('Turn on')
  const before = Number(
    (await page.getByTestId('heavy-vehicle-setup-progress').innerText()).split(' ')[0]
  )
  // Straight to the switch.
  await step.getByRole('link').click()
  await page.waitForURL(/\/settings\/workshop#customerReferenceEnabled/)
  await settle(page)
  const toggle = page.locator('#customerReferenceEnabled')
  await expect(async () => {
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Save Workshop Settings' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()

  await page.goto('/settings/invoice?tab=customFields')
  await settle(page)
  await expect(page.getByTestId('heavy-vehicle-step-reference')).toContainText('On')
  await expect(page.getByTestId('heavy-vehicle-setup-progress')).toHaveText(
    `${before + 1} of 5 turned on`
  )
})

test('put away it is gone, and the line at the foot of the page brings it back', async ({
  page,
}) => {
  await page.goto('/settings/invoice?tab=customFields')
  await settle(page)
  await page.getByRole('button', { name: 'Close the setup checklist' }).click()
  await expect(page.getByTestId('heavy-vehicle-setup')).toHaveCount(0, { timeout: 30_000 })
  await page.reload()
  await expect(page.getByTestId('heavy-vehicle-setup')).toHaveCount(0)
  await page.getByRole('button', { name: 'Open the setup checklist' }).click()
  await expect(page.getByTestId('heavy-vehicle-setup')).toBeVisible({ timeout: 30_000 })
})
