import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { forgetWorkshopSetting, ownerOrganizationId, setWorkshopSetting } from '../../support/db'
import { sharesDiskWithServer, uploadPath } from '../../support/files'
import { TINY_PNG } from '../../support/pdf'
import { addQuotePart, newQuote, quoteShareLink, saveQuote } from '../../support/quote'

/**
 * The workshop's letterhead on a quote a customer opens from a link.
 *
 * A logo uploaded today is stored as `/api/protected/files/...`, which needs
 * a signed-in session. The customer has none, so the shared quote has to hand
 * the browser the link's own public address for it, or the letterhead shows
 * as a broken image.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
let organizationId = ''
let logoFile = ''
let logoName = ''
let previousLogo: string | null = null

test.beforeAll(async () => {
  test.skip(!sharesDiskWithServer(), 'the suite does not share a disk with the app server')
  organizationId = await ownerOrganizationId()
  // Planted rather than uploaded: the logo upload route replaces the
  // workshop's company logo, which every other sheet in the suite prints.
  logoName = `${randomUUID()}.png`
  logoFile = uploadPath(organizationId, 'logos', logoName)
  await mkdir(path.dirname(logoFile), { recursive: true })
  await writeFile(logoFile, TINY_PNG)
  previousLogo = await setWorkshopSetting(
    organizationId,
    'quote.logo',
    `/api/protected/files/${organizationId}/logos/${logoName}`
  )
})

test.afterAll(async () => {
  if (!organizationId) return
  if (previousLogo === null) await forgetWorkshopSetting(organizationId, 'quote.logo')
  else await setWorkshopSetting(organizationId, 'quote.logo', previousLogo)
  if (logoFile) await rm(logoFile, { force: true })
})

test('a shared quote shows the logo uploaded for quotes to a customer with no session', async ({
  page,
  browser,
}) => {
  await newQuote(page, `E2E quote logo ${stamp}`)
  await addQuotePart(page, { name: `E2E wiper ${stamp}`, quantity: 1, unitPrice: 100 })
  await saveQuote(page)
  const shareUrl = await quoteShareLink(page)

  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  const customer = await context.newPage()
  await customer.goto(shareUrl)

  const logo = customer.locator(`img[src*="${logoName}"]`).first()
  await expect(logo).toBeAttached()
  const src = (await logo.getAttribute('src')) ?? ''
  expect(src, 'the logo is addressed through the link, not the signed-in route').toMatch(
    /^\/api\/public\/files\/[^/]+\/logos\//
  )
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
  const response = await context.request.get(src)
  expect(response.status()).toBe(200)
  await context.close()
})
