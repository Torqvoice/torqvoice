import { expect, type Page, test } from '@playwright/test'
import { customerOfVehicle, forgetEmailTemplates, ownerOrganizationId } from '../../support/db'
import { openPreset, preview, railBlock, saveDesign } from '../../support/email-designer'
import { settle } from '../../support/hydration'
import { clearMailbox, waitForMail } from '../../support/mail'
import { addPart, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * What the workshop designed is what the customer receives.
 *
 * The designer is only worth anything if the mail that goes out is the one on
 * screen, so this file designs a template with a sentence nothing else says,
 * makes it the one the workshop sends invoices with, and then sends real mail
 * and reads it out of the sink.
 *
 * Three things are asserted of every mail, because each has its own way of
 * going wrong: the words came from the active template rather than the
 * built-in preset, every tag was filled (a literal "{customer_name}" in a
 * customer's inbox is the failure this feature can produce), and the
 * plain-text half is there, since a mail with only an HTML part is what a
 * spam filter looks for.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const TEMPLATE = `E2E sent invoice ${stamp}`
/** The workshop's own words, so a preset cannot pass for them. */
const SENTENCE = `Thank you for your custom, ${stamp}.`
const RECIPIENT = `e2e-mail-${stamp}@example.com`

let jobUrl = ''
let invoiceNumber = ''
let customer: { name: string; email: string }

/** Every literal tag left in a mail, which should be none. */
function leftoverTags(...parts: string[]): string[] {
  return parts.flatMap((part) => part.match(/\{[a-z_]+\}/g) ?? [])
}

/** Opens the email dialog on the work order and sends it. */
async function emailInvoice(page: Page, to: string, attachPdf: boolean): Promise<void> {
  await page.goto(jobUrl)
  await expect(async () => {
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    await expect(page.locator('#email')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  await page.locator('#email').fill(to)
  const attach = page.locator('#attach-pdf-send')
  await expect(attach).toBeVisible()
  // The workshop's default answers this, so it is set rather than clicked.
  if ((await attach.getAttribute('data-state')) !== (attachPdf ? 'checked' : 'unchecked')) {
    await attach.click()
  }
  await expect(attach).toHaveAttribute('data-state', attachPdf ? 'checked' : 'unchecked')

  await page.getByRole('button', { name: 'Send Email', exact: true }).click()
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })

  // A job worth a real invoice: one part, saved, so the mail has a number, a
  // vehicle and a total to talk about.
  const vehicleUrl = await seededVehicleUrl(page)
  customer = await customerOfVehicle(vehicleUrl.split('/').pop() ?? '')
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E mail job ${stamp}`)
  await addPart(page, { name: `E2E gasket ${stamp}`, quantity: 2, unitPrice: 250 })
  await saveWorkOrder(page)
  invoiceNumber = await page.getByLabel('Invoice Number').inputValue()

  // The workshop's own invoice mail: the preset's words replaced by one
  // sentence and the tags a customer's mail has to fill.
  await openPreset(page, 'invoice_sent')
  await expect(async () => {
    await railBlock(page, 'intro').click()
    await expect(page.getByLabel('Text', { exact: true })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page
    .getByLabel('Text', { exact: true })
    .fill(`${SENTENCE} {customer_name}, your {vehicle} is done. Total {total}.`)
  await expect(preview(page).locator('[data-block="intro"]').getByText(SENTENCE)).toBeVisible()
  await saveDesign(page, TEMPLATE)

  await page.close()
})

test.afterAll(async () => {
  // Back to the built-in preset, or every other spec's mail is this one.
  await forgetEmailTemplates('E2E ')
})

test.describe('a test send from the designer', () => {
  test('arrives marked as a test, in both halves, with nothing left unfilled', async ({ page }) => {
    await clearMailbox()
    await page.goto(`/settings/email-templates`)
    await settle(page)

    // The designer's own Send test, on the template that is now in use.
    await openPreset(page, 'quote_sent')
    await page.getByRole('button', { name: 'Send test' }).click()
    const dialog = page.getByRole('dialog', { name: 'Send a test email' })
    await dialog.getByPlaceholder('Email address').fill(RECIPIENT)
    await dialog.getByRole('button', { name: 'Send', exact: true }).click()

    const mail = await waitForMail(RECIPIENT, { timeout: 30_000 })
    // Marked, so a test sent to a customer by accident says what it is.
    expect(mail.subject).toContain('[Test]')
    expect(mail.html.length, 'the HTML half').toBeGreaterThan(200)
    expect(mail.text.length, 'the plain-text half').toBeGreaterThan(40)
    // Sample data fills the tags: a test mail full of braces tells a workshop
    // nothing about what a customer will see.
    expect(leftoverTags(mail.html, mail.text)).toEqual([])
  })
})

test.describe('an invoice a customer is sent', () => {
  test('is written with the workshop’s template, not the built-in one', async ({ page }) => {
    await clearMailbox()
    await emailInvoice(page, RECIPIENT, true)

    const mail = await waitForMail(RECIPIENT, { timeout: 30_000 })
    expect(mail.html, 'the words the workshop designed').toContain(SENTENCE)
    expect(mail.text, 'and in the plain-text half too').toContain(SENTENCE)

    // The tags filled from this job, not from sample data.
    expect(mail.html).toContain(invoiceNumber)
    expect(mail.html).toContain(customer.name)
    expect(leftoverTags(mail.html, mail.text)).toEqual([])

    // With the PDF attached, the mail says so.
    expect(mail.attachments.map((file) => file.filename).join(' ')).toContain('.pdf')
    expect(mail.html, 'the attachment note').toContain('attached')
  })

  test('says nothing about an attachment when it is sent as a link', async ({ page }) => {
    await clearMailbox()
    await emailInvoice(page, RECIPIENT, false)

    const mail = await waitForMail(RECIPIENT, { timeout: 30_000 })
    expect(mail.attachments, 'no PDF rode along').toHaveLength(0)
    expect(mail.html, 'and no note about one').not.toContain('A PDF copy is attached')
    // The link instead, which is the whole point of sending it this way.
    expect(mail.html).toMatch(/\/share\/invoice\//)
    expect(leftoverTags(mail.html, mail.text)).toEqual([])
  })
})

test.describe('a message to a customer', () => {
  test('is wrapped in the workshop’s mail, and the words are shown as words', async ({ page }) => {
    await clearMailbox()
    await page.goto(jobUrl)
    await settle(page)

    // Typed by a service adviser, including something that looks like markup:
    // it has to reach the customer as text, not as formatting.
    const typed = `Ready for collection <b>today</b> ${stamp}`
    await expect(async () => {
      await page.getByRole('button', { name: 'Notify' }).click()
      await expect(page.getByRole('dialog', { name: /^Notify / })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })

    const dialog = page.getByRole('dialog', { name: /^Notify / })
    await dialog.getByRole('textbox').first().fill(typed)
    const email = dialog.locator('#notify-email')
    if ((await email.getAttribute('data-state')) !== 'checked') await email.click()
    await dialog.getByRole('button', { name: 'Send', exact: true }).click()

    const mail = await waitForMail(customer.email, { timeout: 30_000 })
    // The workshop's message template around the adviser's words.
    expect(mail.text).toContain(`Ready for collection <b>today</b> ${stamp}`)
    expect(mail.html, 'the markup is escaped, not rendered').not.toContain('<b>today</b>')
    expect(mail.html).toContain('&lt;b&gt;today&lt;/b&gt;')
    expect(leftoverTags(mail.html, mail.text)).toEqual([])
  })
})

test.describe('a customer asking for a sign-in link', () => {
  /** The portal switch saves as it is turned, so there is no Save to press. */
  async function setPortal(page: Page, open: boolean): Promise<void> {
    await page.goto('/settings/customer-portal')
    await settle(page)
    const toggle = page.locator('#portal-enabled')
    await expect(toggle).toBeVisible()
    if ((await toggle.getAttribute('aria-checked')) === String(open)) return
    await expect(async () => {
      await toggle.click()
      await expect(toggle).toHaveAttribute('aria-checked', String(open), { timeout: 3_000 })
    }).toPass({ timeout: 30_000 })
  }

  let wasOpen = false

  test('is sent the portal template, with a link that signs them in', async ({ page, request }) => {
    await page.goto('/settings/customer-portal')
    await settle(page)
    wasOpen = (await page.locator('#portal-enabled').getAttribute('aria-checked')) === 'true'
    await setPortal(page, true)

    await clearMailbox()
    const organizationId = await ownerOrganizationId()
    // Asked the way the portal's own sign-in form asks, which is a public
    // route: no session, and a workshop id in the path.
    const asked = await request.post(`/api/public/portal/${organizationId}/auth/request`, {
      data: { email: customer.email },
    })
    expect(asked.ok(), 'the workshop accepted the request').toBe(true)

    const mail = await waitForMail(customer.email, { timeout: 30_000 })
    const link = (mail.html.match(/https?:\/\/[^"'\s]*\/auth\/verify\?token=[^"'\s&]+/) ?? [])[0]
    expect(link, 'the mail carries a sign-in link').toBeTruthy()
    if (!link) throw new Error(`no sign-in link in "${mail.subject}"`)
    expect(mail.text, 'and spells it out for a text-only client').toMatch(/https?:\/\//)
    expect(leftoverTags(mail.html, mail.text)).toEqual([])

    // Following it is the only proof that the mail is worth sending.
    const customerPage = await page
      .context()
      .browser()
      ?.newPage({
        storageState: { cookies: [], origins: [] },
      })
    if (!customerPage) throw new Error('no browser to open the link with')
    await customerPage.goto(link)
    await expect(customerPage, 'the link lands the customer inside the portal').toHaveURL(
      /\/portal\//,
      { timeout: 30_000 }
    )
    await expect(customerPage.getByText(/verify|invalid|expired/i)).toHaveCount(0)
    await customerPage.close()
  })

  test.afterAll(async ({ browser }) => {
    // Left as it was found: the portal is off in a seeded workshop.
    const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
    await setPortal(page, wasOpen)
    await page.close()
  })
})

test.describe('a logo in the mail', () => {
  test('is uploaded, prepared, and fetchable by a mail client with no session', async ({
    page,
    playwright,
  }) => {
    await openPreset(page, 'invoice_sent')
    await expect(async () => {
      await railBlock(page, 'header').click()
      await expect(page.getByRole('button', { name: 'Upload logo' })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    // The workshop's mark, with transparent margins, as one arrives from a
    // designer. The route trims it and prepares it for mail.
    await page.locator('input[type="file"]').first().setInputFiles('e2e/fixtures/email-logo.png')
    const logo = preview(page).locator('[data-block="header"] img')
    await expect(logo, 'the header draws the logo instead of the name').toBeVisible({
      timeout: 30_000,
    })

    await clearMailbox()
    await page.getByRole('button', { name: 'Send test' }).click()
    const dialog = page.getByRole('dialog', { name: 'Send a test email' })
    await dialog.getByPlaceholder('Email address').fill(RECIPIENT)
    await dialog.getByRole('button', { name: 'Send', exact: true }).click()

    const mail = await waitForMail(RECIPIENT, { timeout: 30_000 })
    const src = (mail.html.match(/<img[^>]+src="([^"]+)"/) ?? [])[1]
    expect(src, 'the mail carries the logo').toBeTruthy()
    if (!src) throw new Error('no image in the test mail')

    // A mail client has no cookies, so a logo behind the app's session is a
    // broken picture in every customer's inbox. The address in the mail has
    // to be the public one, and it has to answer.
    //
    // The empty storage state is spelled out because a request context made
    // from the fixture inherits the project's, and the owner's cookie would
    // answer for a mail client that has none.
    expect(src, 'served from the public route').toContain('/api/public/email-')
    const stranger = await playwright.request.newContext({
      baseURL: new URL(src).origin,
      storageState: { cookies: [], origins: [] },
    })
    const fetched = await stranger.get(src)
    expect(fetched.status(), `${src} answers a mail client`).toBe(200)
    expect(fetched.headers()['content-type']).toContain('image/')
    expect(Number(fetched.headers()['content-length'] ?? '0'), 'small enough to mail').toBeLessThan(
      1_000_000
    )
    await stranger.dispose()
  })
})
