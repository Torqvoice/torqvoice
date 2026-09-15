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
 * Both triggers are walked, because they lock at different moments and the
 * button has to survive each of them. The quote setting is off by default and
 * is put back afterwards.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const CUSTOMER = `e2e-quote-lock-${stamp}@example.com`

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

    await convertToWorkOrder(page, quoteUrl, part)
  })

  test('locked once accepted: the customer accepts by link, then converted', async ({ page }) => {
    await setQuoteLock(page, { enabled: true, trigger: 'accepted' })

    const part = `E2E lock accepted part ${stamp}`
    const quoteUrl = await newQuote(page, `E2E locked when accepted ${stamp}`)
    await addQuotePart(page, { name: part, quantity: 1, unitPrice: 700 })
    await saveQuote(page)
    const shareUrl = await quoteShareLink(page)

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

    await convertToWorkOrder(page, quoteUrl, part)
  })
})
