import { expect, test } from '@playwright/test'
import {
  addMark,
  closeEditor,
  earlierSection,
  markEditor,
  openDropoff,
  ownMarks,
} from '../../support/condition-map'
import {
  conditionMarksOf,
  ownerOrganizationId,
  plantConditionJob,
  plantConditionMark,
  plantJobOnVehicle,
  plantOwnMarkKind,
  removeOwnMarkKind,
  userIdFor,
} from '../../support/db'
import { TINY_PNG } from '../../support/pdf'

/**
 * The drop-off on a work order: the car's condition as it came in, drawn on
 * the Drop-off tab of the files card. Marks belong to the vehicle, so a mark
 * from an earlier visit shows grey on the next job, and is cleared there once
 * it has been repaired.
 *
 * Every test plants a car of its own, so nothing another spec or an earlier
 * run drew is on it.
 */

const stamp = Date.now()
let organizationId = ''
let userId = ''

const DAY = 24 * 60 * 60 * 1000

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  userId = await userIdFor('demo@torqvoice.com')
})

const jobUrl = (job: { vehicleId: string; serviceRecordId: string }) =>
  `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`

test('a click on the drawing records a mark, and what is said about it stays', async ({ page }) => {
  const job = await plantConditionJob(organizationId, userId, `E2E drop-off ${stamp}`)
  const map = await openDropoff(page, jobUrl(job))
  await expect(ownMarks(map)).toHaveCount(0)

  const editor = await addMark(page, map, 'left', 'left_front_door')
  // The click made the mark with the first kind on offer, on the panel clicked.
  await expect(editor.getByRole('heading')).toContainText('Dent on the Left front door')

  await editor.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Scratch' }).click()
  await expect(
    editor.getByRole('group', { name: 'Type' }).getByRole('button', { name: 'Scratch' })
  ).toHaveAttribute('aria-pressed', 'true')
  await editor
    .getByRole('group', { name: 'Severity' })
    .getByRole('button', { name: 'Major' })
    .click()
  await expect(
    editor.getByRole('group', { name: 'Severity' }).getByRole('button', { name: 'Major' })
  ).toHaveAttribute('aria-pressed', 'true')
  await editor.getByLabel('Note').fill('Long scratch under the handle')
  await editor.locator('input[type="file"][multiple]').setInputFiles({
    name: `e2e-scratch-${stamp}.png`,
    mimeType: 'image/png',
    buffer: TINY_PNG,
  })
  await expect(editor.getByRole('img', { name: /^Photos of mark 1/ })).toHaveCount(1, {
    timeout: 30_000,
  })
  await closeEditor(page)

  await expect(ownMarks(map)).toHaveCount(1)
  await expect(ownMarks(map).first()).toHaveAccessibleName(
    /^Mark 1: Scratch on the Left front door/
  )

  // What the screen says is what was kept.
  const [row] = await conditionMarksOf(job.vehicleId)
  expect(row).toMatchObject({
    serviceRecordId: job.serviceRecordId,
    inspectionId: null,
    view: 'left',
    panel: 'left_front_door',
    kind: 'scratch',
    severity: 'major',
    note: 'Long scratch under the handle',
    resolvedAt: null,
  })
  expect(row.imageUrls).toHaveLength(1)

  // And a reload draws the same thing, with the tab counting it.
  const again = await openDropoff(page, jobUrl(job))
  await expect(ownMarks(again)).toHaveCount(1)
  await expect(ownMarks(again).first()).toContainText('Long scratch under the handle')
  await expect(page.getByTestId('condition-map-photos')).toBeVisible()
})

test('a mark removed is gone from the job and from the vehicle', async ({ page }) => {
  const job = await plantConditionJob(organizationId, userId, `E2E drop-off remove ${stamp}`)
  const map = await openDropoff(page, jobUrl(job))

  await addMark(page, map, 'top', 'hood')
  await closeEditor(page)
  await addMark(page, map, 'left', 'left_rear_door')
  await closeEditor(page)
  await expect(ownMarks(map)).toHaveCount(2)

  await ownMarks(map).first().click()
  const editor = markEditor(page)
  await expect(editor).toBeVisible()
  await editor.getByRole('button', { name: 'Remove mark' }).click()
  await expect(editor).toBeHidden()
  await expect(ownMarks(map)).toHaveCount(1)

  expect(await conditionMarksOf(job.vehicleId)).toHaveLength(1)
  const again = await openDropoff(page, jobUrl(job))
  await expect(ownMarks(again)).toHaveCount(1)
  await expect(ownMarks(again).first()).toHaveAccessibleName(/on the Left rear door/)
})

test.describe('marks from an earlier visit', () => {
  test('are grey, cannot be changed from here, and clear as repaired', async ({ page }) => {
    const earlier = await plantConditionJob(
      organizationId,
      userId,
      `E2E earlier visit ${stamp}`,
      new Date(Date.now() - 30 * DAY)
    )
    await plantConditionMark(
      organizationId,
      earlier.vehicleId,
      { serviceRecordId: earlier.serviceRecordId },
      { view: 'top', panel: 'hood', kind: 'dent', recordedAt: new Date(Date.now() - 30 * DAY) }
    )
    // Today's job on the same car.
    const today = await plantJobOnVehicle(organizationId, earlier.vehicleId, `E2E next ${stamp}`)

    const map = await openDropoff(page, jobUrl(today))
    await expect(ownMarks(map)).toHaveCount(0)
    const grey = earlierSection(map)
    await expect(grey).toContainText('Bonnet')

    // Opened, it is read only: no kind, severity or note to change, no removing it.
    await grey.getByRole('button', { name: /^Mark 1:/ }).click()
    const editor = markEditor(page)
    await expect(editor).toBeVisible()
    await expect(editor.getByRole('button', { name: 'Scratch' })).toBeDisabled()
    await expect(editor.getByRole('button', { name: 'Remove mark' })).toHaveCount(0)
    await expect(editor).toContainText('Recorded on an earlier visit. Clear it as repaired')
    await page.keyboard.press('Escape')
    await expect(editor).toBeHidden()

    await grey.getByRole('button', { name: 'Clear as repaired' }).click()
    const confirm = page.getByRole('alertdialog', { name: 'Clear as repaired' })
    await confirm.getByRole('button', { name: 'Clear as repaired' }).click()
    await expect(confirm).toBeHidden()
    await expect(earlierSection(map)).toHaveCount(0)

    // Kept in the history, and gone from the page for good.
    const [row] = await conditionMarksOf(earlier.vehicleId)
    expect(row.resolvedAt).not.toBeNull()
    const again = await openDropoff(page, jobUrl(today))
    await expect(earlierSection(again)).toHaveCount(0)
  })

  test('only means earlier: a later visit’s mark is not on an older job', async ({ page }) => {
    const older = await plantConditionJob(
      organizationId,
      userId,
      `E2E older visit ${stamp}`,
      new Date(Date.now() - 60 * DAY)
    )
    await plantConditionMark(
      organizationId,
      older.vehicleId,
      { serviceRecordId: older.serviceRecordId },
      { view: 'top', panel: 'hood', recordedAt: new Date(Date.now() - 60 * DAY) }
    )
    // A later job on the same car found a dent the older one never saw.
    const later = await plantJobOnVehicle(organizationId, older.vehicleId, `E2E later ${stamp}`)
    await plantConditionMark(
      organizationId,
      older.vehicleId,
      { serviceRecordId: later.serviceRecordId },
      { view: 'rear', panel: 'rear_bumper' }
    )

    const map = await openDropoff(page, jobUrl(older))
    await expect(ownMarks(map)).toHaveCount(1)
    await expect(earlierSection(map)).toHaveCount(0)
    // Not listed anywhere on it: the drawing's own caption still names the panel.
    await expect(map.getByRole('button', { name: /on the Rear bumper/ })).toHaveCount(0)
  })
})

test('a kind of the workshop’s own can be put on a mark', async ({ page }) => {
  const own = await plantOwnMarkKind(organizationId, `E2E Hail ${stamp}`)
  try {
    const job = await plantConditionJob(organizationId, userId, `E2E own kind ${stamp}`)
    const map = await openDropoff(page, jobUrl(job))
    const editor = await addMark(page, map, 'top', 'roof')
    const type = editor.getByRole('group', { name: 'Type' })
    await type.getByRole('button', { name: own.name }).click()
    await expect(type.getByRole('button', { name: own.name })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await closeEditor(page)
    await expect(ownMarks(map).first()).toHaveAccessibleName(new RegExp(own.name))

    const [row] = await conditionMarksOf(job.vehicleId)
    expect(row.kind).toBe(own.key)
  } finally {
    await removeOwnMarkKind(own.id)
  }
})

test('a dozen photos at once all reach the mark', async ({ page }) => {
  const job = await plantConditionJob(organizationId, userId, `E2E many photos ${stamp}`)
  const map = await openDropoff(page, jobUrl(job))
  const editor = await addMark(page, map, 'front', 'front_bumper')
  await editor.locator('input[type="file"][multiple]').setInputFiles(
    Array.from({ length: 12 }, (_, i) => ({
      name: `e2e-bumper-${stamp}-${i}.png`,
      mimeType: 'image/png',
      buffer: TINY_PNG,
    }))
  )
  await expect(editor.getByRole('img', { name: /^Photos of mark 1/ })).toHaveCount(12, {
    timeout: 60_000,
  })
  await closeEditor(page)
  const [row] = await conditionMarksOf(job.vehicleId)
  expect(row.imageUrls).toHaveLength(12)
})
