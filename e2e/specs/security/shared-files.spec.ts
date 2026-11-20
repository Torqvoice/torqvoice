import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { type APIRequestContext, type Browser, expect, type Page, test } from '@playwright/test'
import { attach } from '../../support/attachments'
import {
  ownerOrganizationId,
  type PlantedSharedDocuments,
  plantSharedDocuments,
  removeSharedDocuments,
  userIdFor,
} from '../../support/db'
import { sharesDiskWithServer, uploadPath } from '../../support/files'
import { makePdf, TINY_PNG } from '../../support/pdf'
import {
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * What a share link opens on the public file route.
 *
 * Every page a customer reaches through a link draws its pictures, videos
 * and documents through `/api/public/files/<token>/...`. Each one has to
 * load, on every kind of shared document, for a reader with no session at
 * all. And a link opens its own document's files only: the token of one job
 * is no key to the rest of the workshop's uploads, and a file it does not
 * show answers exactly as a file that does not exist.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const PHOTO = `e2e-shared-photo-${stamp}.png`
const REPORT = `e2e-shared-report-${stamp}.pdf`

let organizationId = ''
let jobShareUrl = ''
let planted: PlantedSharedDocuments | null = null
const plantedFiles: string[] = []
const plantedUrls: Record<string, string> = {}

/** A file under the workshop's uploads with the URL a row would hold for it. */
async function plant(folder: string, ext: string, body: Buffer): Promise<string> {
  const name = `${randomUUID()}.${ext}`
  const file = uploadPath(organizationId, folder, name)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, body)
  plantedFiles.push(file)
  return `/api/protected/files/${organizationId}/${folder}/${name}`
}

/** The public address a share page gives a stored file under this token. */
function publicUrl(token: string, storedUrl: string): string {
  return storedUrl.replace(/^\/api\/protected\/files\/[^/]+\//, `/api/public/files/${token}/`)
}

/** A browser with nobody signed in, as the customer opens the link. */
async function customer(browser: Browser) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  return { context, page: await context.newPage() }
}

/** Every public file address the page draws or links to. */
async function publicFileUrls(page: Page): Promise<string[]> {
  const urls = await page.evaluate(() =>
    [...document.querySelectorAll('img[src], video[src], source[src], a[href]')]
      .map((el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '')
      .filter((url) => url.startsWith('/api/public/files/'))
  )
  return [...new Set(urls)]
}

/** Every picture from the file route on the page has decoded. */
async function expectPicturesLoaded(page: Page) {
  await expect(async () => {
    const broken = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('img')]
        .filter((img) => (img.getAttribute('src') ?? '').startsWith('/api/public/files/'))
        .filter((img) => !img.complete || img.naturalWidth === 0)
        .map((img) => img.getAttribute('src'))
    )
    expect(broken, 'every picture on the shared page loaded').toEqual([])
  }).toPass({ timeout: 15_000 })
}

/** Each address answers with the file, to a client with no cookies. */
async function expectServed(request: APIRequestContext, urls: string[]) {
  for (const url of urls) {
    const response = await request.get(url)
    expect(response.status(), `${url} is served`).toBe(200)
    expect(response.headers()['cache-control']).toBe('private, no-store')
  }
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180_000)
  organizationId = await ownerOrganizationId()

  // A job made the way a workshop makes one: a photo and a report on it,
  // then shared.
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  await newWorkOrder(page, vehicleUrl, `E2E shared files ${stamp}`)
  await addPart(page, { name: `E2E filter ${stamp}`, quantity: 1, unitPrice: 100 })
  await saveWorkOrder(page)
  await attach(page, 'Photos', { name: PHOTO, mimeType: 'image/png', buffer: TINY_PNG })
  await attach(page, 'Documents', {
    name: REPORT,
    mimeType: 'application/pdf',
    buffer: await makePdf(['E2E SHARED REPORT']),
  })
  jobShareUrl = await shareLink(page)
  await page.close()

  // The other documents a link can lead to, planted with their files when
  // the suite shares a disk with the server.
  if (!sharesDiskWithServer()) return
  const files = {
    quotePhoto: await plant('quotes', 'png', TINY_PNG),
    quoteDocument: await plant('quotes', 'pdf', await makePdf(['E2E QUOTE TERMS'])),
    inspectionPhoto: await plant('inspections', 'png', TINY_PNG),
    inspectionOverview: await plant('inspections', 'png', TINY_PNG),
    inspectionHidden: await plant('inspections', 'pdf', await makePdf(['E2E PAPERWORK'])),
    statusVideo: await plant('services', 'mp4', Buffer.from('e2e video')),
  }
  Object.assign(plantedUrls, files)
  planted = await plantSharedDocuments(
    organizationId,
    await userIdFor('demo@torqvoice.com'),
    files,
    `Shared files ${stamp}`
  )
})

test.afterAll(async () => {
  if (planted) await removeSharedDocuments(planted)
  await Promise.all(plantedFiles.map((file) => rm(file, { force: true })))
})

test.describe('a shared invoice', () => {
  test('shows its photo and its report to a customer with no session', async ({ browser }) => {
    const { context, page } = await customer(browser)
    await page.goto(jobShareUrl)
    await expect(page.getByText(REPORT).first()).toBeVisible()
    await expectPicturesLoaded(page)

    const urls = await publicFileUrls(page)
    expect(urls.length, 'the photo and the report are drawn through the file route').toBe(2)
    await expectServed(context.request, urls)
    await context.close()
  })
})

test.describe('the other shared documents', () => {
  test.beforeEach(() => {
    test.skip(!planted, 'the suite does not share a disk with the app server')
  })

  test('a quote shows its photo and its document', async ({ browser }) => {
    const { context, page } = await customer(browser)
    await page.goto(`/share/quote/${organizationId}/${planted?.quoteToken}`)
    await expect(page.getByText('estimate.pdf').first()).toBeVisible()
    await expectPicturesLoaded(page)

    const token = planted?.quoteToken ?? ''
    const urls = await publicFileUrls(page)
    expect(urls).toEqual(
      expect.arrayContaining([
        publicUrl(token, plantedUrls.quotePhoto),
        publicUrl(token, plantedUrls.quoteDocument),
      ])
    )
    await expectServed(context.request, urls)
    await context.close()
  })

  test('an inspection shows its check photo and its overview photo', async ({ browser }) => {
    const { context, page } = await customer(browser)
    await page.goto(`/share/inspection/${organizationId}/${planted?.inspectionToken}`)
    await expect(page.getByText('Brakes').filter({ visible: true }).first()).toBeVisible()
    await expectPicturesLoaded(page)

    const token = planted?.inspectionToken ?? ''
    const urls = await publicFileUrls(page)
    expect(urls).toContain(publicUrl(token, plantedUrls.inspectionOverview))
    // The check's own photo opens in the lightbox, which fetches it on a
    // click rather than drawing it on the sheet.
    await expectServed(context.request, [...urls, publicUrl(token, plantedUrls.inspectionPhoto)])
    await context.close()
  })

  test('a status report plays its video', async ({ browser }) => {
    const { context, page } = await customer(browser)
    await page.goto(`/share/status-report/${organizationId}/${planted?.reportToken}`)
    const token = planted?.reportToken ?? ''
    const video = publicUrl(token, plantedUrls.statusVideo)
    await expect(page.locator(`source[src="${video}"], video[src="${video}"]`)).toHaveCount(1)

    const response = await context.request.get(video)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('video/mp4')
    await context.close()
  })

  test('a link opens no file its document does not show', async ({ browser }) => {
    const { context } = await customer(browser)
    const jobToken = jobShareUrl.split('/').pop() ?? ''
    const quoteToken = planted?.quoteToken ?? ''
    const inspectionToken = planted?.inspectionToken ?? ''
    const reportToken = planted?.reportToken ?? ''

    // Each is a real file of this workshop, under a valid link of this
    // workshop, and still not the link's to open.
    const refused = [
      publicUrl(jobToken, plantedUrls.quotePhoto),
      publicUrl(quoteToken, plantedUrls.inspectionPhoto),
      publicUrl(inspectionToken, plantedUrls.inspectionHidden),
      publicUrl(inspectionToken, plantedUrls.statusVideo),
      publicUrl(reportToken, plantedUrls.inspectionPhoto),
    ]
    const missing = await context.request.get(
      `/api/public/files/${jobToken}/quotes/${randomUUID()}.png`
    )
    expect(missing.status()).toBe(404)
    const missingBody = await missing.text()

    for (const url of refused) {
      const response = await context.request.get(url)
      expect(response.status(), `${url} is refused`).toBe(404)
      expect(await response.text(), 'exactly as a missing file').toBe(missingBody)
    }
    await context.close()
  })
})
