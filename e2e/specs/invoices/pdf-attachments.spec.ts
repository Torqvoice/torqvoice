import { expect, type Page, test } from '@playwright/test'
import { attach } from '../../support/attachments'
import { BROKEN_PNG, makePdf, pdfContent, TINY_PNG } from '../../support/pdf'
import {
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * What the job's own files do to the invoice.
 *
 * The workshop's copy carries them and the customer's does not: photographs
 * and diagnostic printouts belong to the shop's file, and an attached report
 * is appended to the download as extra pages. That is the one place the four
 * copies are meant to differ, which makes it the one place worth proving they
 * differ in exactly that way and no other.
 *
 * The last test is a regression guard rather than a feature: an image the
 * renderer cannot decode used to throw inside its own stream, where the route
 * could not catch it, and the request never answered. One truncated
 * photograph made a job's invoice unobtainable.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const REPORT = 'e2e-diagnostic.pdf'
const PHOTO = 'e2e-photo.png'
const REPORT_PAGES = ['E2E DIAGNOSTIC PAGE ONE', 'E2E DIAGNOSTIC PAGE TWO']

let jobUrl = ''
let vehicleUrl = ''
/** Pages before anything was attached. */
let barePages = 0

async function workshopCopy(page: Page, url = jobUrl) {
  const id = url.split('/').pop()
  const response = await page.request.get(`/api/protected/services/${id}/pdf`, {
    timeout: 60_000,
  })
  expect(response.status(), 'the workshop can always get its invoice').toBe(200)
  return pdfContent(await response.body())
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E attachments ${stamp}`)
  await addPart(page, { name: `E2E radiator ${stamp}`, quantity: 1, unitPrice: 900 })
  await saveWorkOrder(page)
  barePages = (await workshopCopy(page)).pages
  expect(barePages).toBeGreaterThan(0)
  await page.close()
})

test.describe('a job with files attached to it', () => {
  test('the report is appended to the workshop copy, page for page', async ({ page }) => {
    await page.goto(jobUrl)
    await attach(page, 'Documents', {
      name: REPORT,
      mimeType: 'application/pdf',
      buffer: await makePdf(REPORT_PAGES),
    })

    const pdf = await workshopCopy(page)
    // Two pages of report, appended whole.
    expect(pdf.pages).toBe(barePages + REPORT_PAGES.length)
    for (const line of REPORT_PAGES) {
      expect(pdf.text, 'the report itself is in there').toContain(line)
    }
    // And the invoice says where those pages came from.
    expect(pdf.flat).toContain(REPORT)
  })

  test('a photograph gets a page of its own', async ({ page }) => {
    await page.goto(jobUrl)
    await attach(page, 'Images', { name: PHOTO, mimeType: 'image/png', buffer: TINY_PNG })

    const pdf = await workshopCopy(page)
    expect(pdf.pages).toBe(barePages + REPORT_PAGES.length + 1)
    expect(pdf.flat, 'the images page names the file').toContain(PHOTO)
  })

  test('the customer gets none of it', async ({ page }) => {
    await page.goto(jobUrl)
    const url = await shareLink(page)
    const [orgId, token] = new URL(url).pathname.split('/').slice(-2)
    const response = await page.request.get(`/api/public/share/invoice/${orgId}/${token}/pdf`)
    expect(response.status()).toBe(200)

    const customer = await pdfContent(await response.body())
    expect(customer.pages, "the customer's copy is the invoice alone").toBe(barePages)
    for (const line of [...REPORT_PAGES, REPORT, PHOTO]) {
      expect(customer.flat, `the customer's copy does not mention ${line}`).not.toContain(line)
    }
  })

  test('a file kept off the invoice stays off it', async ({ page }) => {
    await page.goto(jobUrl)

    /** The documents list, and the row of the report inside it. */
    const openReportRow = async () => {
      await expect(async () => {
        await page.getByRole('button', { name: /^Documents/ }).click()
        await expect(page.getByText(REPORT).first()).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      return page
        .getByText(REPORT)
        .first()
        .locator('xpath=ancestor::div[.//button[@role="switch"]][1]')
    }

    // Each attachment carries a switch for whether it prints. Clicked until
    // it turns: before the page is interactive the click does nothing at all,
    // and the switch looks exactly the same either way.
    const toggle = (await openReportRow()).getByRole('switch')
    await expect(async () => {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    // It turns before the write lands, so the answer is read back from the
    // server rather than from the screen: asked any sooner, the PDF is built
    // from rows the click has not reached yet.
    await page.reload()
    await expect((await openReportRow()).getByRole('switch')).toHaveAttribute(
      'aria-checked',
      'false'
    )

    const pdf = await workshopCopy(page)
    expect(pdf.pages, 'the appended pages are gone').toBe(barePages + 1)
    expect(pdf.text).not.toContain(REPORT_PAGES[0])
    expect(pdf.flat, 'and the report is not named either').not.toContain(REPORT)
  })

  test('an image the renderer cannot read does not take the invoice with it', async ({ page }) => {
    // Its own job: the point is that this one still answers.
    const url = await newWorkOrder(page, vehicleUrl, `E2E broken image ${stamp}`)
    await addPart(page, { name: `E2E hose ${stamp}`, quantity: 1, unitPrice: 120 })
    await saveWorkOrder(page)
    await attach(page, 'Images', {
      name: 'e2e-broken.png',
      mimeType: 'image/png',
      buffer: BROKEN_PNG,
    })

    // Answers at all, which it did not before: the decode threw inside the
    // renderer's own stream and the request hung until it timed out.
    const pdf = await workshopCopy(page, url)
    expect(pdf.pages).toBeGreaterThan(0)
    expect(pdf.flat, 'the invoice is still the invoice').toContain('$120.00')
    // Listed by name, the way an unreadable file already was, rather than drawn.
    expect(pdf.flat).toContain('e2e-broken.png')
  })
})
