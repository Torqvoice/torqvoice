import { expect, test } from '@playwright/test'
import { attachment, attachmentBytes, clearMailbox, waitForMail } from '../../support/mail'
import { type PdfContent, pdfContent } from '../../support/pdf'
import { setTax } from '../../support/settings'
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
 * invoices. All four go through one renderer now.
 *
 * Read as text rather than weighed: the figures are asserted where the
 * customer reads them, so a copy that prints the right shape with the wrong
 * total fails here. The part and the labour are written over several lines on
 * purpose — the sheet has to keep the breaks, which is the last place that
 * could still flatten them.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const CUSTOMER = `e2e-invoice-${stamp}@example.com`

/** Two parts at 725 and two and a half hours at 800: 1,450 + 2,000. */
const PART = `E2E water pump ${stamp}\nGates WP-4471\nwith gasket and coolant`
const LABOR = 'Replace water pump\nand the timing belt with it\nrefill and bleed the coolant'

/** What every copy has to say, whoever it is for. */
const FACTS = [
  '$1,450.00',
  '$2,000.00',
  'Subtotal $3,450.00',
  'Tax (25%) $862.50',
  'Total $4,312.50',
]

let jobUrl = ''
let invoiceNumber = ''
let customerName = ''
let shared: PdfContent
let downloaded: PdfContent

/** Every line of a block the workshop typed, as its own line on the sheet. */
function linesOf(block: string): string[] {
  return block.split('\n')
}

async function expectSaysEverything(pdf: PdfContent, whose: string) {
  expect(pdf.pages, `${whose} has pages`).toBeGreaterThan(0)
  expect(pdf.flat, `${whose} names the invoice`).toContain(invoiceNumber)
  expect(pdf.flat, `${whose} names the customer`).toContain(customerName)
  expect(pdf.flat, `${whose} names the vehicle`).toContain('Toyota Camry')

  for (const fact of FACTS) {
    expect(pdf.flat, `${whose} prints ${fact}`).toContain(fact)
  }

  // Every line on a line of its own. Asserted per line for the failure
  // message, then as the whole block: a block found with its breaks intact is
  // a block the sheet did not flatten.
  for (const line of [...linesOf(PART), ...linesOf(LABOR)]) {
    expect(pdf.text, `${whose} keeps the line "${line}"`).toContain(line)
  }
  expect(pdf.text, `${whose} keeps the part name on its three lines`).toContain(PART)
  expect(pdf.text, `${whose} keeps the labour on its three lines`).toContain(LABOR)
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  // The figures above are pinned, so the tax that makes them is set here. This
  // is also the setting the rest of the suite leaves behind.
  await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })

  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E pdf parity ${stamp}`)
  await addPart(page, { name: PART, quantity: 2, unitPrice: 725 })
  await addLabor(page, { description: LABOR, hours: 2.5, rate: 800 })
  await saveWorkOrder(page)

  invoiceNumber = await page.getByLabel('Invoice Number').inputValue()
  expect(invoiceNumber).not.toBe('')
  // Whoever the seeded vehicle belongs to; the sheet bills them by name.
  customerName =
    (
      await page
        .getByText(/Mitchell/)
        .first()
        .textContent()
    )?.trim() ?? ''
  expect(customerName).not.toBe('')
  await page.close()
})

test.describe('the same invoice however it is handed over', () => {
  test('the workshop can download it, and it says everything', async ({ page }) => {
    await page.goto(jobUrl)
    const id = jobUrl.split('/').pop()
    const response = await page.request.get(`/api/protected/services/${id}/pdf`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/pdf')

    downloaded = await pdfContent(await response.body())
    await expectSaysEverything(downloaded, "the workshop's copy")
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

    await expect(page.getByText('Could not generate the PDF preview.')).toHaveCount(0)
    await expect(page.locator('iframe, embed, object').first()).toBeVisible()
  })

  test('the customer reads the same words from the share link', async ({ page }) => {
    await page.goto(jobUrl)
    const url = await shareLink(page)

    // The link the customer opens is a page; its PDF lives on the public API
    // under the same organisation and token.
    const [orgId, token] = new URL(url).pathname.split('/').slice(-2)
    const response = await page.request.get(`/api/public/share/invoice/${orgId}/${token}/pdf`)
    expect(response.status()).toBe(200)

    shared = await pdfContent(await response.body())
    await expectSaysEverything(shared, "the customer's copy")

    // No attachments on this job, so the two copies are the same sheet down
    // to the last word — and to within a couple of kilobytes, which is what
    // catches a copy that lost an image rather than a word.
    expect(shared.pages).toBe(downloaded.pages)
    expect(shared.flat).toBe(downloaded.flat)
    expect(Math.abs(shared.size - downloaded.size)).toBeLessThan(2_048)
  })

  test('the emailed copy is that document again, word for word', async ({ page }) => {
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
    expect(file.filename).toContain(invoiceNumber)

    const emailed = await pdfContent(attachmentBytes(file))
    await expectSaysEverything(emailed, 'the emailed copy')
    expect(emailed.pages).toBe(shared.pages)
    expect(emailed.flat).toBe(shared.flat)
    // The Torqvoice mark and the Telegram code are images and print no words:
    // the copy that went out without them read the same and weighed
    // kilobytes less, so both are checked.
    expect(Math.abs(emailed.size - shared.size)).toBeLessThan(2_048)
  })
})
