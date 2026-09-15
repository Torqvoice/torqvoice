import { expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'
import { clearMailbox, waitForMail } from '../../support/mail'
import { addQuotePart, newQuote, quoteShareLink, saveQuote } from '../../support/quote'
import { setQuoteLock } from '../../support/settings'

/**
 * A locked quote still becomes a work order.
 *
 * The lock freezes what a quote says it costs, and nothing else: converting it,
 * copying its link and sending it are not edits. The page used to disable the
 * whole details tab through one `<fieldset disabled>`, and a disabled fieldset
 * disables every button inside it too, so "Convert to Work Order" went grey
 * the moment a customer accepted. A workshop reported it as a glitch: the
 * quote they had just been told was accepted could not be turned into the job.
 *
 * The same report turned up two more things a locked quote has to allow: a
 * status that keeps it locked (a quote accepted over the phone), and dismissing
 * the customer's acceptance from the dashboard. Dismissing used to put the
 * quote back to draft, which erased the acceptance and released the lock, and
 * the row stayed on screen until the page was reloaded.
 *
 * Both triggers are walked, because they lock at different moments and the
 * button has to survive each of them. The quote setting is off by default and
 * is put back afterwards.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const CUSTOMER = `e2e-quote-lock-${stamp}@example.com`
/** The seeded Camry belongs to James Mitchell, who is who the Share dialog notifies. */
const SEEDED_CUSTOMER_EMAIL = 'james.mitchell@gmail.com'

/** The editor's price fields are the part the lock is for, so they have to be frozen. */
async function expectPricesFrozen(page: Page, banner: string) {
  await expect(page.getByText(banner, { exact: true })).toBeVisible()
  await expect(page.getByPlaceholder('Name *').first()).toBeDisabled()
}

/** Converts the open quote from its own page and checks the job carries its line. */
async function convertToWorkOrder(page: Page, quoteUrl: string, partName: string) {
  const convert = page.getByRole('button', { name: 'Convert to Work Order', exact: true })
  await expect(convert).toBeEnabled()

  const dialog = page.getByRole('dialog', { name: 'Convert Quote to Work Order' })
  await expect(async () => {
    await convert.click()
    await expect(dialog).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // The quote's own vehicle is chosen already, so Convert is ready to press.
  const confirm = dialog.getByRole('button', { name: 'Convert', exact: true })
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await page.waitForURL(/\/vehicles\/[^/]+\/service\/[^/]+$/, { timeout: 60_000 })
  await settle(page)
  await expect(page.getByPlaceholder('Name *').first()).toHaveValue(partName)

  // Back on the quote, it is marked converted and offers no second conversion.
  await page.goto(quoteUrl)
  await settle(page)
  await expect(page.getByText('converted', { exact: true }).first()).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Convert to Work Order', exact: true })
  ).toHaveCount(0)
}

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setQuoteLock(page, { enabled: false, trigger: 'accepted' })
  await page.close()
})

test.describe('a locked quote can still become a work order', () => {
  test('locked once sent: emailed to the customer, then converted', async ({ page }) => {
    await setQuoteLock(page, { enabled: true, trigger: 'sent' })

    const part = `E2E lock sent part ${stamp}`
    const quoteUrl = await newQuote(page, `E2E locked when sent ${stamp}`)
    await addQuotePart(page, { name: part, quantity: 1, unitPrice: 500 })
    await saveQuote(page)

    // Sent the way the workshop in the report sent theirs.
    await clearMailbox()
    await expect(async () => {
      await page.getByRole('button', { name: 'Email', exact: true }).click()
      await expect(page.locator('#email')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.locator('#email').fill(CUSTOMER)
    await page.getByRole('button', { name: 'Send Email', exact: true }).click()
    await waitForMail(CUSTOMER, { timeout: 30_000 })

    await page.goto(quoteUrl)
    await settle(page)
    await expectPricesFrozen(page, 'This quote is locked because it has been sent')

    // The customer says yes on the phone. A status that keeps the quote locked
    // is not an edit, and one that would release the lock is not offered.
    const status = page.getByRole('combobox', { name: 'Status' })
    await expect(status).toBeEnabled()
    await expect(async () => {
      await status.click()
      await expect(page.getByRole('option', { name: 'Accepted' })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect(page.getByRole('option', { name: 'Draft' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    await page.getByRole('option', { name: 'Accepted' }).click()
    await expect(status).toContainText('Accepted')
    // Disabled while the change is written, so enabled again means it landed.
    await expect(status).toBeEnabled()

    await page.reload()
    await settle(page)
    await expect(page.getByRole('combobox', { name: 'Status' })).toContainText('Accepted')
    await expectPricesFrozen(page, 'This quote is locked because it has been sent')

    await convertToWorkOrder(page, quoteUrl, part)
  })

  test('locked once accepted: the customer accepts by link, then converted', async ({ page }) => {
    await setQuoteLock(page, { enabled: true, trigger: 'accepted' })

    const part = `E2E lock accepted part ${stamp}`
    const title = `E2E locked when accepted ${stamp}`
    const quoteUrl = await newQuote(page, title)
    await addQuotePart(page, { name: part, quantity: 1, unitPrice: 700 })
    await saveQuote(page)
    const shareUrl = await quoteShareLink(page)

    // Telling the customer from the Share dialog closes it once the mail has
    // gone, instead of leaving a finished dialog on screen.
    await clearMailbox()
    const shareDialog = page.getByRole('dialog', { name: 'Share Quote' })
    await expect(async () => {
      await page.getByRole('button', { name: 'Share', exact: true }).click()
      await expect(shareDialog).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await shareDialog.locator('#notify-email-quote').click()
    await shareDialog.getByRole('button', { name: 'Send Notification', exact: true }).click()
    await expect(shareDialog).toBeHidden({ timeout: 30_000 })
    await waitForMail(SEEDED_CUSTOMER_EMAIL, { timeout: 30_000 })

    // Sharing sends it, and under this trigger a sent quote is still open.
    await page.goto(quoteUrl)
    await settle(page)
    await expect(page.getByPlaceholder('Name *').first()).toBeEnabled()

    // Signed out, the way a customer opens the link in their mail.
    const customer = await page
      .context()
      .browser()!
      .newContext({
        storageState: { cookies: [], origins: [] },
      })
    const customerPage = await customer.newPage()
    await customerPage.goto(shareUrl)
    await expect(async () => {
      await customerPage.getByRole('button', { name: 'Accept Quote' }).click()
      await expect(customerPage.getByText('Quote Accepted')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 30_000 })
    await customer.close()

    await page.goto(quoteUrl)
    await settle(page)
    await expectPricesFrozen(page, 'This quote is locked because it has been accepted')

    // Copying the link is not an edit either.
    await expect(page.getByRole('button', { name: 'Copy link', exact: true })).toBeEnabled()

    // Dismissed from the dashboard, the response leaves the list without a
    // reload and stays gone, while the quote keeps the acceptance and its lock.
    await page.goto('/')
    await settle(page)
    const row = page.getByTestId('quote-response-row').filter({ hasText: title })
    await expect(row).toBeVisible()
    await expect(async () => {
      await row.getByRole('button', { name: 'Dismiss response' }).click()
      await expect(row).toHaveCount(0, { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.reload()
    await settle(page)
    await expect(page.getByTestId('quote-response-row').filter({ hasText: title })).toHaveCount(0)

    await page.goto(quoteUrl)
    await settle(page)
    await expectPricesFrozen(page, 'This quote is locked because it has been accepted')

    await convertToWorkOrder(page, quoteUrl, part)
  })
})
