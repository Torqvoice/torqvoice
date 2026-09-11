import { existsSync } from 'node:fs'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, type Page, test } from '@playwright/test'
import {
  deleteServiceAttachments,
  insertServiceAttachment,
  ownerOrganizationId,
  serviceAttachmentsNamed,
} from '../../support/db'
import { pdfContent, TINY_PNG } from '../../support/pdf'
import {
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * A stored file URL is data somebody typed at some point.
 *
 * Every file a workshop uploads is kept as a URL on a record, and that URL is
 * later turned into a path on disk and read, copied or unlinked. The audit
 * found it joined onto the upload folder with no containment check, so a
 * record carrying `../../.env` read the server's own files into a PDF. Three
 * layers stand in the way now: the file routes refuse a path with a dot pair,
 * the actions refuse to store a URL that is not one of this workshop's own
 * uploads, and the path resolver refuses to leave the folder for whatever is
 * stored already.
 *
 * And an SVG is a document with scripts in it: uploaded as a logo it ran for
 * every visitor on the app's origin. Uploads are decoded and re-encoded now,
 * and a stored SVG is offered as a download inside a sandbox.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
/** A real picture of some size, so drawing it is visible in the PDF's bytes. */
const LOGO = path.join('public', 'torqvoice_app_logo.png')

let organizationId = ''
let jobUrl = ''
let jobId = ''
/** The share token of the job's invoice, for the public file route. */
let shareToken = ''

async function workshopCopy(page: Page) {
  const response = await page.request.get(`/api/protected/services/${jobId}/pdf`, {
    timeout: 60_000,
  })
  expect(response.status(), 'the workshop can always get its invoice').toBe(200)
  const body = await response.body()
  return { bytes: body.length, ...(await pdfContent(body)) }
}

/** Where the app writes uploads, when the suite shares a disk with it. */
function uploadDir(...segments: string[]): string {
  return path.join('data', 'uploads', organizationId, ...segments)
}

test.beforeAll(async ({ browser }) => {
  organizationId = await ownerOrganizationId()
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E file safety ${stamp}`)
  jobId = jobUrl.split('/').pop() ?? ''
  await addPart(page, { name: `E2E gasket ${stamp}`, quantity: 1, unitPrice: 100 })
  await saveWorkOrder(page)
  shareToken = new URL(await shareLink(page)).pathname.split('/').pop() ?? ''
  await page.close()
})

test.describe('the file routes', () => {
  test('refuse a path that climbs out of the upload folder', async ({ page }) => {
    // Encoded, because a browser would fold a literal `..` away before the
    // request left it; a client that wants the traversal does not.
    const climbs = [
      '..%2F..%2F..%2F..%2Fpackage.json',
      '%2E%2E%2F%2E%2E%2Fpackage.json',
      '..%5C..%5Cpackage.json',
    ]
    for (const climb of climbs) {
      for (const url of [
        `/api/protected/files/${organizationId}/services/${climb}`,
        `/api/public/files/${shareToken}/services/${climb}`,
      ]) {
        const response = await page.request.get(url)
        expect([400, 404], `${url} is refused`).toContain(response.status())
        expect(await response.text(), 'and nothing of the file came back').not.toContain(
          '"scripts"'
        )
      }
    }
  })
})

test.describe('a file URL on a record', () => {
  test('is not stored unless it is one of this workshop’s own uploads', async ({ browser }) => {
    // The client uploads the file, then hands the answer's URL to the action
    // that puts it on the job. Here the answer is rewritten on its way back,
    // which is what a client that wanted to would do.
    const forged = [
      { url: `/api/protected/files/${organizationId}/services/../../../../package.json` },
      { url: '/api/files/../../.env' },
      { url: `/api/protected/files/not-this-workshop/services/${stamp}.txt` },
      { url: `https://example.com/${stamp}.txt` },
    ]
    const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
    await page.goto(jobUrl)

    for (const [i, { url }] of forged.entries()) {
      const name = `e2e-forged-${i}-${stamp}.txt`
      await page.route('**/api/protected/upload/service-files', async (route) => {
        const response = await route.fetch()
        const json = (await response.json()) as Record<string, unknown>
        await route.fulfill({ response, json: { ...json, url } })
      })

      await expect(async () => {
        await page.getByRole('button', { name: /^Documents/ }).click()
        await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await page
        .locator('input[type="file"][accept=".pdf,.csv,.txt"]')
        .setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('forged') })

      await expect(
        page.getByText(/not an upload of this workshop/i).first(),
        `${url} is refused, and the page says why`
      ).toBeVisible({ timeout: 30_000 })
      await page.unroute('**/api/protected/upload/service-files')
      expect(await serviceAttachmentsNamed(name), `${url} was not stored`).toBe(0)
    }
    await page.close()
  })

  test('that climbs out of the folder is listed on the invoice, never read', async ({ page }) => {
    // Rows written straight to the database, as records from before the
    // schema guard would be. The oracle is the printed document: a picture
    // that is drawn gets a "Service Images" page of its own, one that is
    // only listed adds its name to the invoice and nothing else. (Byte size
    // would not do: a flat-colour logo deflates to a kilobyte once the
    // renderer re-encodes it.) The picture goes up through the upload route
    // rather than the images tab, which re-encodes what it is given.
    const uploaded = await page.request.post('/api/protected/upload/service-files', {
      multipart: {
        file: {
          name: `e2e-real-${stamp}.png`,
          mimeType: 'image/png',
          buffer: await readFile(LOGO),
        },
      },
    })
    expect(uploaded.status()).toBe(200)
    const realFile = ((await uploaded.json()) as { url: string }).url.split('/').pop()
    const bare = await workshopCopy(page)

    const withRow = async (fileName: string, fileUrl: string) => {
      const id = await insertServiceAttachment({
        serviceRecordId: jobId,
        fileName,
        fileUrl,
        fileType: 'image/png',
      })
      try {
        return await workshopCopy(page)
      } finally {
        await deleteServiceAttachments([id])
      }
    }

    // The control: the uploaded file, reached by climbing out of the folder
    // and straight back in. It stays inside, so it is drawn, which proves the
    // climb below starts where the app's upload folder is.
    const control = await withRow(
      `e2e-control-${stamp}.png`,
      `/api/protected/files/${organizationId}/services/../../../../data/uploads/${organizationId}/services/${realFile}`
    )
    expect(control.pages, 'a path that stays inside the folder is drawn').toBe(bare.pages + 1)
    expect(control.flat).toContain('Service Images')
    expect(control.flat).toContain(`e2e-control-${stamp}.png`)

    // The escape: the same climb, ending in a real picture outside the
    // folder. Listed by name, and not one pixel of it in the document.
    const escaped = await withRow(
      `e2e-escape-${stamp}.png`,
      `/api/protected/files/${organizationId}/services/../../../../${LOGO}`
    )
    expect(escaped.flat, 'the invoice still names the file').toContain(`e2e-escape-${stamp}.png`)
    expect(escaped.pages, 'but did not draw it').toBe(bare.pages)
    expect(escaped.flat).not.toContain('Service Images')
  })
})

test.describe('an SVG', () => {
  test('is not accepted as a logo or a portal background, whatever it is called', async ({
    page,
  }) => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="owned"</script></svg>'
    )
    for (const route of ['logo', 'portal-background']) {
      const url = `/api/protected/upload/${route}`
      const declared = await page.request.post(url, {
        multipart: { file: { name: 'logo.svg', mimeType: 'image/svg+xml', buffer: svg } },
      })
      expect(declared.status(), `${route}: an SVG declared as one`).toBe(400)

      // Declared as a PNG, which is what a client that wanted it stored would
      // say. The bytes are decoded before anything is written, and these do
      // not decode.
      const disguised = await page.request.post(url, {
        multipart: { file: { name: 'logo.png', mimeType: 'image/png', buffer: svg } },
      })
      expect(disguised.status(), `${route}: an SVG declared as a PNG`).toBe(400)
    }
  })

  test('already on disk is a download inside a sandbox, never a page on the app’s origin', async ({
    page,
  }) => {
    // Written straight into the upload folder, as a file from before the
    // upload routes re-encoded would be. Only possible when the suite shares
    // a disk with the server, which it does locally and on CI.
    test.skip(!existsSync(uploadDir()), 'the suite does not share a disk with the app server')

    const name = `e2e-${stamp}.svg`
    await mkdir(uploadDir('logos'), { recursive: true })
    await writeFile(
      uploadDir('logos', name),
      '<svg xmlns="http://www.w3.org/2000/svg"><script>document.title="owned"</script></svg>'
    )
    try {
      for (const url of [
        `/api/protected/files/${organizationId}/logos/${name}`,
        `/api/public/files/${shareToken}/logos/${name}`,
      ]) {
        const response = await page.request.get(url)
        expect(response.status(), `${url} is served`).toBe(200)
        const headers = response.headers()
        expect(headers['content-disposition'], `${url} is a download`).toBe('attachment')
        expect(headers['content-security-policy'], `${url} is sandboxed`).toContain('sandbox')
        expect(headers['x-content-type-options']).toBe('nosniff')
      }
    } finally {
      await unlink(uploadDir('logos', name))
    }
  })

  test('is refused where a picture is expected, and a picture is stored as what it is', async ({
    page,
  }) => {
    // The stored file's extension is what the bytes turned out to be, not
    // what the name said; a PNG called .svg is a .png on disk, and is served
    // as one. The portal background is the route without a side effect on
    // the workshop's current logo.
    const response = await page.request.post('/api/protected/upload/portal-background', {
      multipart: { file: { name: 'picture.svg', mimeType: 'image/png', buffer: TINY_PNG } },
    })
    expect(response.status()).toBe(200)
    const { url } = (await response.json()) as { url: string }
    expect(url).toMatch(
      new RegExp(`^/api/protected/files/${organizationId}/portal/[0-9a-f-]+\\.png$`)
    )

    const served = await page.request.get(url)
    expect(served.status()).toBe(200)
    expect(served.headers()['content-type']).toBe('image/png')

    // Tidied away when the suite shares a disk with the server; otherwise the
    // stray background stays where every other spec's uploads do.
    if (existsSync(uploadDir('portal'))) {
      await unlink(uploadDir('portal', url.split('/').pop() ?? ''))
    }
  })
})
