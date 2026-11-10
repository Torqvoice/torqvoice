import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'
import {
  deleteTechnicians,
  insertTechnician,
  jobAssignment,
  jobHelperIds,
  jobStart,
  ownerOrganizationId,
  technicianIdNamed,
  workshopSetting,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { jobIdOf, newWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * A job worked by more than one person.
 *
 * A work order has one technician, the name on the invoice and the lane the
 * card sits in. A workshop also puts an apprentice or a second pair of hands
 * on the same car, and relies on that being written down where people look:
 * the work order says who leads and who is with them, the work board shows the
 * job in the helper's day as well as the technician's, and the helper's phone
 * lists it. Handing the job over swaps the two, and taking the technician off
 * takes everybody off, so a job never has helpers and no lead.
 */

// Each test opens two or three of the heaviest pages (work order, work board,
// team settings), which is more than the default budget on a cold server.
test.describe.configure({ mode: 'serial', timeout: 120_000 })

const stamp = Date.now()
const LEAD = `E2E Lead ${stamp}`
const HELPER = `E2E Helper ${stamp}`
const MECHANIC = `E2E Phone Helper ${stamp}`
const PHONE = `556${String(stamp).slice(-7)}`
const TITLE = `E2E shared job ${stamp}`

let organizationId = ''
let leadId = ''
let helperId = ''
let mechanicId = ''
let jobUrl = ''
let jobId = ''
/** The helper's phone: no cookies, so only its token speaks for it. */
let device: APIRequestContext
let token = ''

test.beforeAll(async ({ playwright, baseURL }) => {
  organizationId = await ownerOrganizationId()
  leadId = await insertTechnician(organizationId, LEAD)
  helperId = await insertTechnician(organizationId, HELPER)
  device = await playwright.request.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  })
})

test.afterAll(async () => {
  await device?.dispose()
  // The job stays, like every other spec's; whoever was on it goes with the
  // technicians, and the helper rows with them.
  await deleteTechnicians([leadId, helperId].filter(Boolean))
})

/** The card's technician list. */
function technicianList(page: Page): Locator {
  return page.getByRole('radiogroup', { name: 'Technician' })
}

function rowOf(page: Page, technicianId: string): Locator {
  return page.getByTestId(`tech-row-${technicianId}`)
}

/** Makes somebody the job's technician with a click on their name. */
async function makeTechnician(page: Page, technicianId: string): Promise<void> {
  const radio = rowOf(page, technicianId).getByRole('radio')
  await expect(async () => {
    await radio.click()
    await expect(radio).toHaveAttribute('aria-checked', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await expect.poll(async () => (await jobAssignment(jobId)).technicianId).toBe(technicianId)
}

/** Puts somebody on the job beside its technician, from the end of their row. */
async function addHelper(page: Page, name: string, technicianId: string): Promise<void> {
  const add = page.getByRole('button', { name: `Add ${name} to this job` })
  await expect(add).toBeVisible()
  await add.click()
  await expect(page.getByRole('button', { name: `Take ${name} off this job` })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect.poll(() => jobHelperIds(jobId)).toContain(technicianId)
}

/** The day a job starts on, and the Monday-or-whatever its board week starts on. */
async function boardAddressFor(serviceRecordId: string): Promise<string> {
  const start = await jobStart(serviceRecordId)
  expect(start, 'a new job is booked into a slot').not.toBeNull()
  const zone =
    (await workshopSetting(organizationId, 'workshop.timezone')) ||
    (await workshopSetting(organizationId, 'workshop.timezoneDetected')) ||
    'UTC'
  // The board's days are the workshop's days, not UTC's or the browser's.
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(start as Date)
  const weekStartDay = Number(
    (await workshopSetting(organizationId, 'workboard.weekStartDay')) ?? '1'
  )
  const noon = Date.parse(`${day}T12:00:00Z`)
  const back = (new Date(noon).getUTCDay() - weekStartDay + 7) % 7
  const week = new Date(noon - back * 86_400_000).toISOString().slice(0, 10)
  return `/work-board?view=week&week=${week}&date=${day}&group=technician`
}

/** Whether a block sits inside one of the columns headed with this name. */
async function inColumnOf(page: Page, block: Locator, name: string): Promise<boolean> {
  const box = await block.boundingBox()
  if (!box) return false
  // Every day repeats the lane headers, so the column is one of several.
  const headers = page.getByRole('button', { name, exact: true })
  for (const header of await headers.all()) {
    const lane = await header.boundingBox()
    if (lane && box.x >= lane.x - 2 && box.x + box.width <= lane.x + lane.width + 2) return true
  }
  return false
}

test('a helper is put on the job beside its technician', async ({ page }) => {
  jobUrl = await newWorkOrder(page, await seededVehicleUrl(page), TITLE)
  jobId = jobIdOf(jobUrl)
  await expect(technicianList(page)).toBeVisible()

  // Nobody can help on a job nobody has: no add buttons yet.
  await expect(page.getByRole('button', { name: `Add ${HELPER} to this job` })).toHaveCount(0)

  await makeTechnician(page, leadId)
  await addHelper(page, HELPER, helperId)

  await expect(rowOf(page, helperId)).toContainText('Also on this job')
  await expect(rowOf(page, leadId)).toContainText('Lead')
  await expect(rowOf(page, leadId)).not.toContainText('Also on this job')

  // Written down, not just drawn.
  await page.reload()
  await settle(page)
  await expect(rowOf(page, helperId)).toContainText('Also on this job')
  await expect(rowOf(page, leadId)).toContainText('Lead')
  await expect(rowOf(page, leadId).getByRole('radio')).toHaveAttribute('aria-checked', 'true')

  expect((await jobAssignment(jobId)).technicianId).toBe(leadId)
  expect(await jobHelperIds(jobId)).toEqual([helperId])
})

test('the board shows the job in the helper’s day, saying whose it is', async ({ page }) => {
  await page.goto(await boardAddressFor(jobId))
  await settle(page)

  // The job itself: a solid block in the technician's column, counting the
  // one extra person on it.
  const block = page.locator(
    `[role="button"][aria-label*="${TITLE}"]:not([data-testid="job-shadow"])`
  )
  await expect(block).toHaveCount(1)
  await expect(block.getByTestId('job-team-count')).toHaveText('+1')
  await block.scrollIntoViewIfNeeded()
  expect(await inColumnOf(page, block, LEAD), 'the job sits in its technician’s column').toBe(true)

  // Its echo: an outline in the helper's column naming the technician.
  const shadow = page.getByTestId('job-shadow').filter({ hasText: TITLE })
  await expect(shadow).toHaveCount(1)
  await expect(shadow).toContainText(`With ${LEAD}`)
  await shadow.scrollIntoViewIfNeeded()
  expect(await inColumnOf(page, shadow, HELPER), 'the outline sits in the helper’s column').toBe(
    true
  )

  // Opened from the board, the job says who else is on it.
  await expect(async () => {
    await block.click()
    await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  const dialog = page.getByRole('dialog', { name: TITLE })
  await expect(dialog.getByText('Also on this job')).toBeVisible()
  await expect(dialog.getByRole('button', { name: HELPER, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('making the helper the technician swaps the two', async ({ page }) => {
  await page.goto(jobUrl)
  await settle(page)

  await makeTechnician(page, helperId)

  await expect(rowOf(page, helperId)).toContainText('Lead')
  await expect(rowOf(page, helperId)).not.toContainText('Also on this job')
  await expect(rowOf(page, leadId)).toContainText('Also on this job')
  await expect(page.getByRole('button', { name: `Take ${LEAD} off this job` })).toHaveAttribute(
    'aria-pressed',
    'true'
  )

  await expect.poll(() => jobHelperIds(jobId)).toEqual([leadId])
  expect((await jobAssignment(jobId)).technicianId).toBe(helperId)
})

test('no technician takes everybody off the job', async ({ page }) => {
  await page.goto(jobUrl)
  await settle(page)

  await expect(async () => {
    await page.getByRole('button', { name: 'Someone else' }).click()
    await expect(page.getByRole('option', { name: 'No technician' })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('option', { name: 'No technician' }).click()

  await expect.poll(async () => (await jobAssignment(jobId)).technicianId).toBeNull()
  await expect.poll(() => jobHelperIds(jobId)).toEqual([])

  const list = technicianList(page)
  await expect(list.getByRole('radio', { checked: true })).toHaveCount(0)
  await expect(list.getByText('Also on this job')).toHaveCount(0)
  await expect(list.getByText('Lead', { exact: true })).toHaveCount(0)
  await expect(list.getByRole('button', { name: /to this job$|off this job$/ })).toHaveCount(0)

  await page.reload()
  await settle(page)
  await expect(technicianList(page).getByText('Also on this job')).toHaveCount(0)
})

test.describe('the helper’s phone', () => {
  test('a mechanic with the app is set up at the desk', async ({ page }) => {
    // The same path as specs/tech/api.spec.ts: a person with a phone, a code
    // read off the desk, the code redeemed by a context with no cookies.
    await page.goto('/settings/team')
    await settle(page)
    await expect(async () => {
      await page.getByRole('button', { name: 'Add', exact: true }).first().click()
      await expect(page.getByText('A mechanic')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByText('A mechanic').click()

    await expect(page.getByPlaceholder('Their full name')).toBeVisible({ timeout: 10_000 })
    await page.getByPlaceholder('Their full name').fill(MECHANIC)
    const country = page
      .getByRole('combobox')
      .filter({ hasText: /choose a country/i })
      .first()
    if (await country.isVisible().catch(() => false)) {
      await country.click()
      await page
        .getByRole('option', { name: /United States/i })
        .first()
        .click()
    }
    await page.getByPlaceholder('The phone in their pocket').fill(PHONE)
    await page.getByRole('button', { name: 'Create', exact: true }).click()

    await expect(page.getByText(/or read them this code/i)).toBeVisible({ timeout: 30_000 })
    const codeText = await page
      .getByText(/^[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{4}[\s-]?[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{4}$/)
      .first()
      .innerText()
    const code = codeText.replace(/[^A-Z2-9]/g, '')
    expect(code).toHaveLength(8)

    const redeemed = await device.post('/api/v1/tech/setup/redeem', { data: { code } })
    expect(redeemed.status()).toBe(200)
    token = (await redeemed.json()).data.token
    expect(token).toBeTruthy()
    mechanicId = await technicianIdNamed(organizationId, MECHANIC)
  })

  test('lists a job they only help on, and drops it when taken off', async ({ page }) => {
    const jobsOnPhone = async (): Promise<string[]> => {
      const response = await device.get('/api/v1/tech/jobs', {
        headers: { authorization: `Bearer ${token}` },
      })
      expect(response.status()).toBe(200)
      return (await response.json()).data.jobs.map((job: { id: string }) => job.id)
    }
    expect(await jobsOnPhone(), 'nothing of theirs yet').not.toContain(jobId)

    await page.goto(jobUrl)
    await settle(page)
    await makeTechnician(page, leadId)
    await addHelper(page, MECHANIC, mechanicId)
    expect((await jobAssignment(jobId)).technicianId, 'still not their job to lead').toBe(leadId)

    await expect.poll(jobsOnPhone, { message: 'the helper’s phone lists the job' }).toContain(jobId)

    const takeOff = page.getByRole('button', { name: `Take ${MECHANIC} off this job` })
    await takeOff.click()
    await expect(page.getByRole('button', { name: `Add ${MECHANIC} to this job` })).toBeVisible()
    await expect.poll(() => jobHelperIds(jobId)).toEqual([])

    await expect.poll(jobsOnPhone, { message: 'and drops it again' }).not.toContain(jobId)
  })
})
