import { expect, type Page, test } from '@playwright/test'
import {
  addMark,
  certificatePdf,
  closeEditor,
  conditionMap,
  earlierSection,
  markEditor,
  openDropoff,
  ownMarks,
  printsMap,
} from '../../support/condition-map'
import {
  conditionMarksOf,
  forgetWorkshopSetting,
  ownerOrganizationId,
  plantConditionInspection,
  plantConditionJob,
  plantConditionMark,
  plantJobOnVehicle,
  setWorkshopSetting,
  userIdFor,
} from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * The condition map as an inspection check, and how it meets the work order.
 *
 * Marks drawn on the inspection are this visit on the job it is linked to
 * (shown there in colour, changed only on the inspection), and a job's
 * drop-off marks are grey on the inspection. A completed inspection is a
 * finished document: its map can no longer be changed, and its certificate
 * keeps what it said when a mark is later cleared as repaired.
 *
 * The certificate only prints the map from a designed certificate, so the
 * file gives the workshop one and takes it away again afterwards.
 */

const stamp = Date.now()
const DESIGN_KEY = 'certificate.layoutConfig'
let organizationId = ''
let userId = ''
let designBefore: string | null = null

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  userId = await userIdFor('demo@torqvoice.com')
  designBefore = await setWorkshopSetting(
    organizationId,
    DESIGN_KEY,
    JSON.stringify({ version: 2, documentType: 'certificate' })
  )
})

test.afterAll(async () => {
  if (designBefore === null) await forgetWorkshopSetting(organizationId, DESIGN_KEY)
  else await setWorkshopSetting(organizationId, DESIGN_KEY, designBefore)
})

const jobUrl = (job: { vehicleId: string; serviceRecordId: string }) =>
  `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`

async function openInspection(page: Page, inspectionId: string) {
  await page.goto(`/inspections/${inspectionId}`)
  await settle(page)
  const map = conditionMap(page)
  await expect(map).toBeVisible({ timeout: 30_000 })
  return map
}

async function complete(page: Page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'Complete', exact: true }).first().click()
    await expect(page.getByRole('alertdialog', { name: 'Complete this inspection?' })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  const confirm = page.getByRole('alertdialog', { name: 'Complete this inspection?' })
  await confirm.getByRole('button', { name: 'Complete', exact: true }).click()
  await expect(page.getByText('Inspection completed').first()).toBeVisible()
  // Completing offers to share the certificate straight away; not today.
  const share = page.getByRole('dialog').filter({ hasText: 'Share a read-only view' })
  const offered = await share
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (offered) {
    await page.keyboard.press('Escape')
    await expect(share).toBeHidden()
  }
}

test('a mark drawn on the inspection is on the linked job, where it cannot be changed', async ({
  page,
}) => {
  const job = await plantConditionJob(organizationId, userId, `E2E linked ${stamp}`)
  const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`, {
    serviceRecordId: job.serviceRecordId,
  })

  const map = await openInspection(page, inspection.inspectionId)
  await addMark(page, map, 'right', 'right_front_door')
  await closeEditor(page)
  await expect(ownMarks(map)).toHaveCount(1)

  const [row] = await conditionMarksOf(job.vehicleId)
  expect(row).toMatchObject({
    inspectionId: inspection.inspectionId,
    serviceRecordId: null,
    panel: 'right_front_door',
  })

  // On the job it is this visit: in colour, said to come from the inspection.
  const onJob = await openDropoff(page, jobUrl(job))
  await expect(ownMarks(onJob)).toHaveCount(1)
  await expect(onJob).toContainText('From the linked inspection, changed there')
  await ownMarks(onJob).first().click()
  const editor = markEditor(page)
  await expect(editor.getByRole('button', { name: 'Scratch' })).toBeDisabled()
  await expect(editor.getByRole('button', { name: 'Remove mark' })).toHaveCount(0)
  // And says where it can be changed, rather than asking to reopen the job.
  await expect(editor).toContainText('Drawn on the linked inspection. Change it there.')
  await expect(editor).not.toContainText('Reopen to change the condition map')
})

test('a job’s drop-off mark is grey on the inspection', async ({ page }) => {
  const job = await plantConditionJob(organizationId, userId, `E2E dropoff grey ${stamp}`)
  await plantConditionMark(
    organizationId,
    job.vehicleId,
    { serviceRecordId: job.serviceRecordId },
    { view: 'top', panel: 'hood', recordedAt: new Date(Date.now() - 60_000) }
  )
  const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`, {
    serviceRecordId: job.serviceRecordId,
  })

  const map = await openInspection(page, inspection.inspectionId)
  await expect(ownMarks(map)).toHaveCount(0)
  await expect(earlierSection(map)).toContainText('Bonnet')
})

test('a second map check on the inspection is the same visit, changed on its own check', async ({
  page,
}) => {
  const job = await plantConditionJob(organizationId, userId, `E2E two checks ${stamp}`)
  const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`, {
    secondCheck: true,
  })
  await plantConditionMark(
    organizationId,
    job.vehicleId,
    { inspectionId: inspection.inspectionId, inspectionItemId: inspection.secondItemId! },
    { view: 'rear', panel: 'rear_bumper' }
  )

  await openInspection(page, inspection.inspectionId)
  const maps = page.getByTestId('condition-map')
  await expect(maps).toHaveCount(2)
  const first = maps.first()
  // On the first check it is this visit, in colour, said to come from the other check.
  await expect(ownMarks(first)).toHaveCount(1)
  await expect(earlierSection(first)).toHaveCount(0)
  await expect(first).toContainText('From another check on this inspection')
  await ownMarks(first).first().click()
  const editor = markEditor(page)
  await expect(editor).toContainText('Drawn on another check of this inspection. Change it there.')
  await expect(editor.getByRole('button', { name: 'Remove mark' })).toHaveCount(0)
  await page.keyboard.press('Escape')

  // On its own check it can be changed.
  await ownMarks(maps.last()).first().click()
  await expect(editor.getByRole('button', { name: 'Remove mark' })).toBeVisible()
})

test('a completed inspection’s map cannot be changed until it is reopened', async ({ page }) => {
  const job = await plantConditionJob(organizationId, userId, `E2E completed ${stamp}`)
  const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`)
  await plantConditionMark(organizationId, job.vehicleId, inspection, {
    view: 'left',
    panel: 'left_rear_door',
  })

  const map = await openInspection(page, inspection.inspectionId)
  await complete(page)
  await expect(map).toContainText('Reopen to change the condition map.')

  // A click on the drawing adds nothing.
  await map.locator('path[data-view="top"][data-panel="roof"]').click()
  await expect(markEditor(page)).toBeHidden()
  expect(await conditionMarksOf(job.vehicleId)).toHaveLength(1)
})

test.describe('the certificate', () => {
  test('prints the inspection’s marks', async ({ page }) => {
    const job = await plantConditionJob(organizationId, userId, `E2E cert ${stamp}`)
    const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`)
    await plantConditionMark(organizationId, job.vehicleId, inspection, {
      view: 'left',
      panel: 'left_front_door',
      note: 'Dent by the handle',
    })

    const pdf = await certificatePdf(page, inspection.inspectionId)
    expect(printsMap(pdf)).toBe(true)
    expect(pdf.flat).toContain('Left front door')
    expect(pdf.flat).toContain('Dent by the handle')
  })

  test('prints no map when the inspection recorded no mark of its own', async ({ page }) => {
    const job = await plantConditionJob(organizationId, userId, `E2E cert bare ${stamp}`)
    await plantConditionMark(
      organizationId,
      job.vehicleId,
      { serviceRecordId: job.serviceRecordId },
      { view: 'top', panel: 'hood', recordedAt: new Date(Date.now() - 60_000) }
    )
    const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`)

    const pdf = await certificatePdf(page, inspection.inspectionId)
    expect(printsMap(pdf)).toBe(false)
    expect(pdf.flat).not.toContain('Bonnet')
  })

  test('keeps what it said when a mark is later cleared as repaired', async ({ page }) => {
    const job = await plantConditionJob(organizationId, userId, `E2E cert frozen ${stamp}`)
    const inspection = await plantConditionInspection(organizationId, job.vehicleId, `E2E ${stamp}`)
    await plantConditionMark(organizationId, job.vehicleId, inspection, {
      view: 'left',
      panel: 'left_front_door',
      recordedAt: new Date(Date.now() - 60_000),
    })
    await openInspection(page, inspection.inspectionId)
    await complete(page)
    expect((await certificatePdf(page, inspection.inspectionId)).flat).toContain('Left front door')

    // The next job finds it repaired and clears it: allowed, and the history keeps it.
    const nextJob = await plantJobOnVehicle(organizationId, job.vehicleId, `E2E next ${stamp}`)
    const next = await openDropoff(page, jobUrl(nextJob))
    const grey = earlierSection(next)
    await grey.getByRole('button', { name: 'Clear as repaired' }).click()
    await page
      .getByRole('alertdialog', { name: 'Clear as repaired' })
      .getByRole('button', { name: 'Clear as repaired' })
      .click()
    await expect(earlierSection(next)).toHaveCount(0)

    const after = await certificatePdf(page, inspection.inspectionId)
    expect(printsMap(after), 'the completed certificate still has its map').toBe(true)
    expect(after.flat).toContain('Left front door')
  })
})
