import { type Browser, expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'
import { addQuotePart, newQuote, quoteShareLink, saveQuote } from '../../support/quote'

/**
 * A customer's answer to a quote, followed from the bell to the quote.
 *
 * A workshop reported that clicking "Quote Changes Requested" in the
 * notification panel did nothing, when they expected the quote to open with
 * the customer's request on it. Both ways a desk meets the notification are
 * walked: opened later from another page, and arriving live while the quote
 * itself is already on screen.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

/** A shared quote the customer can answer, open in the editor. */
async function sharedQuote(page: Page, title: string) {
  const quoteUrl = await newQuote(page, title)
  await addQuotePart(page, { name: `E2E notification part ${stamp}`, quantity: 1, unitPrice: 300 })
  await saveQuote(page)
  const shareUrl = await quoteShareLink(page)
  return { quoteUrl, shareUrl }
}

/** The customer asks for a change on the public page, signed out. */
async function requestChanges(browser: Browser, shareUrl: string, request: string) {
  const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const customerPage = await customer.newPage()
  await customerPage.goto(shareUrl)
  await expect(async () => {
    await customerPage.getByRole('button', { name: 'Request Changes' }).click()
    await expect(customerPage.getByRole('textbox')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await customerPage.getByRole('textbox').fill(request)
  await customerPage.getByRole('button', { name: 'Submit Request' }).click()
  await expect(customerPage.getByText('Changes Requested').first()).toBeVisible()
  await customer.close()
}

/** Opens the bell and clicks the newest notification with this title. */
async function clickNotification(page: Page, title: string) {
  const panel = page.getByRole('dialog', { name: 'Notifications' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Open notifications' }).click()
    await expect(panel).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await panel.getByRole('button').filter({ hasText: title }).first().click()
}

test('opened from the bell, a change request lands on the quote showing the request', async ({
  page,
  browser,
}) => {
  const request = `Please use a genuine filter ${stamp}`
  const title = `E2E notified quote ${stamp}`
  const { quoteUrl, shareUrl } = await sharedQuote(page, title)
  await requestChanges(browser, shareUrl, request)

  await page.goto('/')
  await settle(page)
  await clickNotification(page, 'Quote Changes Requested')

  await page.waitForURL(quoteUrl, { timeout: 15_000 })
  await expect(page.getByText(request)).toBeVisible()

  // And on the list, under "Needs attention", highlighted as a change request.
  await page.goto(`/quotes?status=attention&search=${encodeURIComponent(title)}`)
  await settle(page)
  const row = page.getByRole('row').filter({ hasText: title })
  await expect(row).toHaveAttribute('data-attention', 'changes_requested')
  await expect(page.getByRole('button', { name: /Needs attention/ })).toBeVisible()
  await page.goto(quoteUrl)
  // At the top of the quote, seen without scrolling past the lines first.
  await expect(page.getByText(request)).toBeInViewport()
})

test('arriving while the quote is open, clicking it shows the request without a reload', async ({
  page,
  browser,
}) => {
  const request = `Could you add wiper blades ${stamp}`
  const { quoteUrl, shareUrl } = await sharedQuote(page, `E2E live notified quote ${stamp}`)

  await page.goto(quoteUrl)
  await settle(page)
  await requestChanges(browser, shareUrl, request)

  await clickNotification(page, 'Quote Changes Requested')
  // Still this quote: the newest notification is the one that just arrived.
  await expect(page).toHaveURL(quoteUrl)
  await expect(page.getByText(request)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(request)).toBeInViewport()
  await expect(page.getByText('Changes Requested', { exact: true }).first()).toBeVisible()
})
