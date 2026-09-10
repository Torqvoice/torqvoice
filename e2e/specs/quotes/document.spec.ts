import { expect, type Page, test } from '@playwright/test'
import { attachment, attachmentBytes, clearMailbox, waitForMail } from '../../support/mail'
import { type PdfContent, pdfContent } from '../../support/pdf'
import {
  addQuoteLabor,
  addQuotePart,
  newQuote,
  quotePdfUrl,
  quoteShareLink,
  saveQuote,
} from '../../support/quote'
import { setTax } from '../../support/settings'

/**
 * The quote a customer is actually handed.
 *
 * Turning a quote into a work order is covered elsewhere; this is the document
 * itself, which is a priced offer and has been untested. It is drawn by its
 * own renderer (`QuotePDF`), from its own layout, and reaches the customer
 * three ways: the workshop's download, a public link, and a copy attached to
 * an email. Then the customer answers it, and the answer has to come back.
 *
 * The figures are pinned: two parts at 900 and three hours at 800, so 1,800
 * and 2,400 make a subtotal of 4,200, and 25% on top makes 5,250. If one of
 * these moves, the quote path has changed.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const TITLE = `E2E quote ${stamp}`
const PART = `E2E clutch kit ${stamp}\nLuK 624 3163 33\nwith release bearing`
const LABOR = 'Replace the clutch\nand bleed the system'
const CUSTOMER = `e2e-quote-${stamp}@example.com`

/** What every copy of this quote has to say. */
const FACTS = ['$1,800.00', '$2,400.00', '$4,200.00', '$5,250.00']

let quoteUrl = ''
let shareUrl = ''
let downloaded: PdfContent
let shared: PdfContent

async function workshopPdf(page: Page): Promise<PdfContent> {
  const id = quoteUrl.split('/').pop()
  const response = await page.request.get(`/api/protected/quotes/${id}/pdf`, { timeout: 60_000 })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('application/pdf')
  return pdfContent(await response.body())
}

async function expectSaysEverything(pdf: PdfContent, whose: string) {
  expect(pdf.pages, `${whose} has pages`).toBeGreaterThan(0)
  expect(pdf.flat, `${whose} names the customer`).toContain('Mitchell')
  expect(pdf.flat, `${whose} names the vehicle`).toContain('Toyota Camry')
  for (const fact of FACTS) {
    expect(pdf.flat, `${whose} prints ${fact}`).toContain(fact)
  }
  // Both lines were written over several lines, and a quote is read as
  // carefully as an invoice.
  expect(pdf.text, `${whose} keeps the part on its three lines`).toContain(PART)
  expect(pdf.text, `${whose} keeps the labour on its two lines`).toContain(LABOR)
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  // The figures above are pinned, so the tax that makes them is set here. This
  // is also the setting the rest of the suite leaves behind.
  await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })

  quoteUrl = await newQuote(page, TITLE)
  await addQuotePart(page, { name: PART, quantity: 2, unitPrice: 900 })
  await addQuoteLabor(page, { description: LABOR, hours: 3, rate: 800 })
  await saveQuote(page)
  await page.close()
})

test.describe('a quote as the customer receives it', () => {
  test('the editor adds up to the figures the quote will carry', async ({ page }) => {
    await page.goto(quoteUrl)
    // Loosely matched: the thousands separator follows the workshop's locale,
    // and this assertion is about arithmetic.
    for (const figure of [/1[\s.,]?800/, /2[\s.,]?400/, /4[\s.,]?200/, /5[\s.,]?250/]) {
      await expect(page.getByText(figure).first()).toBeVisible()
    }
  })

  test('the workshop can download it, and it says everything', async ({ page }) => {
    await page.goto(quoteUrl)
    downloaded = await workshopPdf(page)
    await expectSaysEverything(downloaded, "the workshop's copy")
  })

  test('the preview is that same download, not a second rendering', async ({ page }) => {
    await page.goto(quoteUrl)
    const id = quoteUrl.split('/').pop()

    const request = page.waitForRequest((r) => r.url().includes(`/quotes/${id}/pdf`))
    await expect(async () => {
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'PDF preview' })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })
    await request

    await expect(page.getByText('Could not generate the PDF preview.')).toHaveCount(0)
  })

  test('the public link opens the same document, word for word', async ({ page }) => {
    await page.goto(quoteUrl)
    shareUrl = await quoteShareLink(page)

    // The page the customer opens.
    await page.goto(shareUrl)
    for (const fact of FACTS) {
      await expect(
        page.getByText(fact).filter({ visible: true }).first(),
        `${fact} on the shared quote`
      ).toBeVisible()
    }

    // And the PDF behind its download button.
    const response = await page.request.get(quotePdfUrl(shareUrl))
    expect(response.status()).toBe(200)
    shared = await pdfContent(await response.body())
    await expectSaysEverything(shared, "the customer's copy")

    expect(shared.pages).toBe(downloaded.pages)
    expect(shared.flat).toBe(downloaded.flat)
    expect(Math.abs(shared.size - downloaded.size)).toBeLessThan(2_048)
  })

  test('the emailed copy is that document again', async ({ page }) => {
    await clearMailbox()
    await page.goto(quoteUrl)

    await expect(async () => {
      await page.getByRole('button', { name: 'Email', exact: true }).click()
      await expect(page.locator('#email')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.locator('#email').fill(CUSTOMER)
    await page.getByRole('button', { name: 'Send Email', exact: true }).click()

    const mail = await waitForMail(CUSTOMER, { timeout: 30_000 })
    const file = attachment(mail, /\.pdf$/)
    expect(file.contentType).toContain('pdf')

    const emailed = await pdfContent(attachmentBytes(file))
    await expectSaysEverything(emailed, 'the emailed copy')
    expect(emailed.pages).toBe(shared.pages)
    expect(emailed.flat).toBe(shared.flat)
  })

  test('the customer accepts it, and the workshop sees the answer', async ({ page }) => {
    // Signed out, the way a customer opens a link.
    const customer = await page.context().browser()?.newContext()
    const customerPage = await (customer as NonNullable<typeof customer>).newPage()
    await customerPage.goto(shareUrl)

    await expect(async () => {
      await customerPage.getByRole('button', { name: 'Accept Quote' }).click()
      await expect(customerPage.getByText('Quote Accepted')).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 30_000 })
    await customer?.close()

    // The workshop's own page reads the new status.
    await page.goto(quoteUrl)
    await expect(page.getByText('Accepted').first()).toBeVisible()
  })
})
