import { expect, type Page, test } from '@playwright/test'
import { attach } from '../../support/attachments'
import {
  deleteTechnicians,
  deleteWorkBays,
  insertTechnician,
  insertWorkBay,
  jobAssignment,
  jobCount,
  latestAttachmentUrl,
  organizationIdFor,
  seededTenantFixtures,
  type TenantFixtures,
} from '../../support/db'
import { shareLink } from '../../support/work-order'

/**
 * One workshop cannot reach another's records.
 *
 * Seven unit tests already check that the queries carry an organisation id
 * (`src/__tests__/multitenancy/`), but they mock Prisma: they prove the code
 * asks the right question, not that the running app refuses the wrong one. A
 * missing scope on one route, a page that reads an id straight from the URL,
 * a file served by path rather than by owner — none of that shows up in a
 * mocked query.
 *
 * So a second workshop is opened here, by signing up the way a stranger
 * would, and then pointed at the first one's pages, documents and files. What
 * it must see, everywhere, is nothing.
 *
 * The share token is the exception worth stating: it is unguessable, and
 * holding it is how a customer was given the document. It still has to belong
 * to the organisation named in the link.
 */

test.describe.configure({ mode: 'serial' })

// A stranger's browser: no session, until this file makes one.
test.use({ storageState: { cookies: [], origins: [] } })

const stamp = Date.now()
const OUTSIDER = `e2e-outsider-${stamp}@example.com`
const PASSWORD = `E2e-pass-${stamp}`

let seeded: TenantFixtures
/** A shared invoice link from the first workshop, for the token tests. */
let sharedInvoice = ''
/** A file that genuinely belongs to the first workshop's own job. */
let theirFileUrl = ''

/** Signs the outsider in, opening their workshop on the first run. */
async function signInAsOutsider(page: Page) {
  await page.goto('/auth/sign-in')
  await page.locator('#email').fill(OUTSIDER)
  await page.locator('#password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 30_000 })
}

test.beforeAll(async ({ browser }) => {
  seeded = await seededTenantFixtures()

  // A link the first workshop handed to one of its own customers, minted here
  // so the token tests have a real one to try in the wrong place.
  const owner = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await owner.goto(`/vehicles/${seeded.vehicleId}/service/${seeded.serviceRecordId}`)
  sharedInvoice = await shareLink(owner)

  // And a file of their own, put there rather than looked for: a seeded
  // workshop has no attachments, so a spec that goes hunting for one only
  // finds what another spec happened to leave behind.
  await attach(owner, 'Documents', {
    name: `e2e-tenancy-${stamp}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from("One workshop's paperwork."),
  })
  theirFileUrl = await latestAttachmentUrl(seeded.serviceRecordId)
  await owner.close()
})

test.describe('a second workshop', () => {
  test('is opened by a stranger signing up', async ({ page }) => {
    await page.goto('/auth/sign-up')
    await page.locator('#name').fill('E2E Outsider')
    await page.locator('#email').fill(OUTSIDER)
    await page.locator('#password').fill(PASSWORD)
    await page.locator('#terms').click()
    await page.getByRole('button', { name: /create account/i }).click()

    await page.waitForURL(/\/onboarding/, { timeout: 30_000 })
    await page.locator('#workshopName').fill(`E2E Outsider Garage ${stamp}`)
    await page.locator('form button[type="submit"]').click()
    await page.waitForURL((url) => !/^\/(auth|onboarding)/.test(url.pathname), { timeout: 30_000 })

    await expect(page.getByText(`E2E Outsider Garage ${stamp}`).first()).toBeVisible()
  })

  test('sees none of the first workshop’s customers or vehicles in its own lists', async ({
    page,
  }) => {
    await signInAsOutsider(page)

    await page.goto('/customers')
    // The seed's customers are a fleet company and nineteen others; a fresh
    // workshop has none of them.
    await expect(page.getByText('Summit Construction')).toHaveCount(0)
    await expect(page.getByText('James Mitchell')).toHaveCount(0)

    await page.goto('/vehicles')
    await expect(page.getByText('Camry')).toHaveCount(0)
  })

  test('is handed nothing when it types the first workshop’s addresses', async ({ page }) => {
    await signInAsOutsider(page)

    // Not the status code: a page may answer 200 and draw an empty shell,
    // which is a refusal as much as a 404 is. What must never appear is a
    // word belonging to the other workshop.
    const theirs = [seeded.vehiclePlate, seeded.customerName, seeded.quoteNumber]

    for (const [what, url] of Object.entries({
      vehicle: `/vehicles/${seeded.vehicleId}`,
      'work order': `/vehicles/${seeded.vehicleId}/service/${seeded.serviceRecordId}`,
      customer: `/customers/${seeded.customerId}`,
      quote: `/quotes/${seeded.quoteId}`,
    })) {
      await page.goto(url)
      // Still the outsider's own app, so an absence below means something.
      await expect(
        page.getByText(`E2E Outsider Garage ${stamp}`).first(),
        `${what} is still the outsider's app`
      ).toBeVisible()

      const shown = await page.locator('body').innerText()
      for (const word of theirs) {
        expect(shown, `${what} does not show "${word}"`).not.toContain(word)
      }
    }
  })

  test('cannot fetch the first workshop’s documents', async ({ page }) => {
    await signInAsOutsider(page)

    const invoice = await page.request.get(`/api/protected/services/${seeded.serviceRecordId}/pdf`)
    expect(invoice.status(), 'the invoice PDF is refused').toBe(404)

    const quote = await page.request.get(`/api/protected/quotes/${seeded.quoteId}/pdf`)
    expect(quote.status(), 'the quote PDF is refused').toBe(404)
  })

  test('cannot fetch the first workshop’s files', async ({ page }) => {
    await signInAsOutsider(page)

    // Files are served by a path that names the organisation, so this is the
    // one place where guessing an id would be enough if nothing checked.
    const file = await page.request.get(theirFileUrl)
    expect(file.status(), `${theirFileUrl} is refused`).toBeGreaterThanOrEqual(400)
    expect(file.status()).toBeLessThan(500)
  })

  test('cannot spend a share token under its own organisation', async ({ page }) => {
    const [, token] = new URL(sharedInvoice).pathname.split('/').slice(-2)

    // The outsider's real workshop, not an invented id: the question is
    // whether a token minted by one organisation opens under another, and a
    // made-up id would only prove that nonsense is refused.
    const outsiderOrg = await organizationIdFor(OUTSIDER)
    expect(outsiderOrg).not.toBe(seeded.organizationId)

    const response = await page.request.get(`/api/public/share/invoice/${outsiderOrg}/${token}/pdf`)
    expect(response.status(), 'the token does not travel between workshops').toBe(404)

    // Nor does a token invented from nothing.
    const nonsense = await page.request.get(
      `/api/public/share/invoice/${seeded.organizationId}/not-a-real-token/pdf`
    )
    expect(nonsense.status()).toBe(404)
  })

  test('the token still works where it belongs', async ({ page }) => {
    // The other half of the rule: this is a real link the first workshop gave
    // its customer, and it has to keep opening.
    const [orgId, token] = new URL(sharedInvoice).pathname.split('/').slice(-2)
    const response = await page.request.get(`/api/public/share/invoice/${orgId}/${token}/pdf`)
    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toContain('application/pdf')
  })
})

/**
 * A job booked from the work board names the technician and the bay it was
 * dropped on, by id, in the URL that opens the new job. Those ids have to be
 * the workshop's own: the technician lookup used to write the id it was given
 * even when it found nothing, so a job could point at another workshop's
 * technician, and the bay was never looked up at all.
 */
test.describe('a job booked onto a technician and a bay', () => {
  const made = { technicians: [] as string[], bays: [] as string[] }
  let theirs = { technicianId: '', workBayId: '' }
  let ours = { technicianId: '', workBayId: '' }

  test.beforeAll(async () => {
    const outsiderOrg = await organizationIdFor(OUTSIDER)
    theirs = {
      technicianId: await insertTechnician(outsiderOrg, `E2E Their Tech ${stamp}`),
      workBayId: await insertWorkBay(outsiderOrg, `E2E Their Bay ${stamp}`),
    }
    ours = {
      technicianId: await insertTechnician(seeded.organizationId, `E2E Own Tech ${stamp}`),
      workBayId: await insertWorkBay(seeded.organizationId, `E2E Own Bay ${stamp}`),
    }
    made.technicians.push(theirs.technicianId, ours.technicianId)
    made.bays.push(theirs.workBayId, ours.workBayId)
  })

  test.afterAll(async () => {
    await deleteTechnicians(made.technicians)
    await deleteWorkBays(made.bays)
  })

  test('is refused when either belongs to the other workshop', async ({ browser }) => {
    const owner = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
    const before = await jobCount(seeded.vehicleId)
    const newJob = `/vehicles/${seeded.vehicleId}/service/new`

    await owner.goto(`${newJob}?boardTech=${theirs.technicianId}&boardBay=${ours.workBayId}`)
    await expect(owner.getByText('Technician not found')).toBeVisible()
    await expect(owner).toHaveURL(/\/service\/new/)

    await owner.goto(`${newJob}?boardTech=${ours.technicianId}&boardBay=${theirs.workBayId}`)
    await expect(owner.getByText('Work bay not found')).toBeVisible()
    await expect(owner).toHaveURL(/\/service\/new/)

    expect(await jobCount(seeded.vehicleId), 'no job was made').toBe(before)
    await owner.close()
  })

  test('opens on the workshop’s own technician and bay', async ({ browser }) => {
    const owner = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
    await owner.goto(
      `/vehicles/${seeded.vehicleId}/service/new?boardTech=${ours.technicianId}&boardBay=${ours.workBayId}`
    )
    await owner.waitForURL(/\/service\/(?!new)[^/]+$/, { timeout: 30_000 })

    const jobId = new URL(owner.url()).pathname.split('/').pop() as string
    expect(await jobAssignment(jobId)).toEqual({
      id: jobId,
      technicianId: ours.technicianId,
      workBayId: ours.workBayId,
    })
    await owner.close()
  })
})
