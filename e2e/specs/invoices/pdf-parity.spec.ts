import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { attachment, attachmentBytes, clearMailbox, waitForMail } from '../../support/mail'
import {
  addLabor,
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * One invoice, four ways to hand it over: the preview, the workshop's
 * download, the customer's share link, and the copy attached to an email.
 *
 * They must be the same document, and they were not. The emailed copy was
 * rendered from its own call and went out without the portal link, the
 * Telegram code and the Torqvoice mark the other three carry — a customer
 * comparing the mail with the link would have been looking at two different
 * invoices. All four go through one renderer now, and this is what holds
 * them there.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const CUSTOMER = `e2e-invoice-${stamp}@example.com`

let jobUrl = ''
let sharedPdf: Buffer
let downloadedPdf: Buffer

/** Page count and rough size: enough to catch a copy printing something else. */
async function shape(pdf: Buffer): Promise<{ pages: number; size: number }> {
  const document = await PDFDocument.load(pdf)
  return { pages: document.getPageCount(), size: pdf.byteLength }
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E pdf parity ${stamp}`)
  await addPart(page, { name: `E2E water pump ${stamp}`, quantity: 1, unitPrice: 1_450 })
  await addLabor(page, { description: 'Replace water pump and belt', hours: 2.5, rate: 800 })
  await saveWorkOrder(page)
  await page.close()
})

test.describe('the same invoice however it is handed over', () => {
  test('the workshop can download it', async ({ page }) => {
    await page.goto(jobUrl)
    const id = jobUrl.split('/').pop()
    const response = await page.request.get(`/api/protected/services/${id}/pdf`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/pdf')
    downloadedPdf = Buffer.from(await response.body())
    expect((await shape(downloadedPdf)).pages).toBeGreaterThan(0)
  })

  test('the preview is that same download, not a second rendering', async ({ page }) => {
    await page.goto(jobUrl)
    const id = jobUrl.split('/').pop()

    // The dialog fetches the document rather than drawing its own, which is
    // the only way looking before sending means anything.
    const request = page.waitForRequest((r) => r.url().includes(`/services/${id}/pdf`))
    await expect(async () => {
      await page.getByRole('button', { name: 'Preview', exact: true }).click()
      await expect(page.getByRole('dialog', { name: 'PDF preview' })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })
    await request

    // And it shows what came back, rather than a failure message.
    await expect(page.getByText('Could not generate the PDF preview.')).toHaveCount(0)
    await expect(page.locator('iframe, embed, object').first()).toBeVisible()
  })

  test('the customer opens the same document from the share link', async ({ page }) => {
    await page.goto(jobUrl)
    const url = await shareLink(page)

    // The link the customer opens is a page; its PDF lives on the public API
    // under the same organisation and token.
    const [orgId, token] = new URL(url).pathname.split('/').slice(-2)
    const response = await page.request.get(`/api/public/share/invoice/${orgId}/${token}/pdf`)
    expect(response.status()).toBe(200)
    sharedPdf = Buffer.from(await response.body())

    // No attachments on this job, so the workshop's copy and the customer's
    // are the same sheet. A difference here means one of them is printing
    // something the other is not.
    const [customer, workshop] = await Promise.all([shape(sharedPdf), shape(downloadedPdf)])
    expect(customer.pages).toBe(workshop.pages)
    expect(Math.abs(customer.size - workshop.size)).toBeLessThan(2_048)
  })

  test('the emailed copy is the same document again', async ({ page }) => {
    await clearMailbox()
    await page.goto(jobUrl)

    await expect(async () => {
      await page.getByRole('button', { name: 'Email', exact: true }).click()
      await expect(page.locator('#email')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.locator('#email').fill(CUSTOMER)
    await page.getByRole('button', { name: 'Send Email', exact: true }).click()

    const mail = await waitForMail(CUSTOMER, { timeout: 30_000 })
    const file = attachment(mail, /\.pdf$/)
    expect(file.contentType).toContain('pdf')

    const emailed = await shape(attachmentBytes(file))
    const customer = await shape(sharedPdf)
    expect(emailed.pages).toBe(customer.pages)
    // The Torqvoice mark and the Telegram code are images; a copy missing
    // them is kilobytes smaller, which is exactly the bug this pins.
    expect(Math.abs(emailed.size - customer.size)).toBeLessThan(2_048)
  })
})
