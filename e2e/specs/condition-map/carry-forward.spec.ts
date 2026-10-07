import { expect, type Locator, type Page, type Request, test } from '@playwright/test'
import {
  certificatePdf,
  conditionMap,
  earlierSection,
  markEditor,
  openDropoff,
  ownMarks,
  printsMap,
  workOrderPdf,
} from '../../support/condition-map'
import { type CarryMarkRow, marksWithCarry, setMarkPhotos } from '../../support/condition-map-db'
import {
  ownerOrganizationId,
  plantConditionInspection,
  plantConditionJob,
  plantConditionMark,
  plantJobOnVehicle,
  userIdFor,
} from '../../support/db'
import { settle } from '../../support/hydration'
import { TINY_PNG } from '../../support/pdf'

/**
 * "Confirm all as still there": the marks still open from earlier visits,
 * listed grey under the map, recorded again on this sheet as this visit's
 * own in one press. Each earlier mark is closed in the same go and points at
 * the mark that took its place (`carriedToId`), so:
 *
 * - this sheet now holds them in colour, with the note and photos they had;
 * - the earlier sheet still shows and prints them as its own record, read
 *   only, since the newer copy is the one that changes now;
 * - the vehicle meets the dent once: a newer visit sees the copies, never
 *   the originals as well;
 * - pressing it again finds nothing left to take.
 *
 * Every test plants a car of its own, with the earlier job a month back and
 * the job doing the confirming ten days back, so a third job opened today is
 * the newest visit.
 */

const stamp = Date.now()
const DAY = 24 * 60 * 60 * 1000
/** The grey every earlier visit's mark is drawn in (PREVIOUS_MARK_COLOR). */
const GREY = '#9ca3af'
const CARRIED_TEXT =
  "Confirmed again on a later visit. It stays here as this visit's record and is changed there."

// Each test opens three or four pages and reads PDFs; a minute is tight.
test.describe.configure({ timeout: 180_000 })

let organizationId = ''
let userId = ''

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  userId = await userIdFor('demo@torqvoice.com')
})

const jobUrl = (job: { vehicleId: string; serviceRecordId: string }) =>
  `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`

/** Every mark drawn on the map itself (the legend's icons carry no role). */
const glyphs = (map: Locator) => map.locator('svg[role="img"] g[role="button"]')
/** The ones drawn grey: an earlier visit's. */
const greyGlyphs = (map: Locator) =>
  glyphs(map).filter({ has: map.page().locator(`[stroke="${GREY}"]`) })
/** The buttons that open a mark listed under "Recorded on an earlier visit". */
const earlierMarks = (map: Locator) =>
  earlierSection(map).getByRole('button', { name: /^Mark \d+:/ })

/**
 * A car with two marks from a visit a month ago (a dent on the bonnet with a
 * note, a major scratch on the left front door), and the job ten days ago
 * that is to confirm them.
 */
async function carWithTwoEarlierMarks(label: string) {
  const earlier = await plantConditionJob(
    organizationId,
    userId,
    `${label} earlier ${stamp}`,
    new Date(Date.now() - 30 * DAY)
  )
  const note = `Dent by the badge ${label} ${stamp}`
  const hood = await plantConditionMark(
    organizationId,
    earlier.vehicleId,
    { serviceRecordId: earlier.serviceRecordId },
    {
      view: 'top',
      panel: 'hood',
      kind: 'dent',
      note,
      recordedAt: new Date(Date.now() - 30 * DAY),
    }
  )
  const door = await plantConditionMark(
    organizationId,
    earlier.vehicleId,
    { serviceRecordId: earlier.serviceRecordId },
    {
      view: 'left',
      panel: 'left_front_door',
      kind: 'scratch',
      severity: 'major',
      recordedAt: new Date(Date.now() - 30 * DAY + 60_000),
    }
  )
  const later = await plantJobOnVehicle(
    organizationId,
    earlier.vehicleId,
    `${label} later ${stamp}`,
    new Date(Date.now() - 10 * DAY)
  )
  return { earlier, later, hood, door, note, vehicleId: earlier.vehicleId }
}

/**
 * Presses "Confirm all as still there" and waits for the earlier marks to be
 * closed in the database. Repeated until the grey list goes: a press before
 * hydration does nothing.
 */
async function confirmAll(map: Locator, vehicleId: string, expected: number) {
  const button = map.getByTestId('condition-map-confirm-all')
  await expect(button).toHaveText('Confirm all as still there')
  await expect(async () => {
    await button.click()
    await expect(earlierSection(map)).toHaveCount(0, { timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  await expect
    .poll(async () => (await marksWithCarry(vehicleId)).filter((m) => m.carriedToId).length, {
      message: 'the earlier marks are closed and point at their copies',
    })
    .toBe(expected)
}

/** The planted originals and the copies that took their place, by the original's id. */
function carried(rows: CarryMarkRow[], originalIds: string[]) {
  return originalIds.map((id) => {
    const original = rows.find((m) => m.id === id)
    if (!original) throw new Error(`mark ${id} is gone`)
    const copy = rows.find((m) => m.id === original.carriedToId)
    if (!copy) throw new Error(`mark ${id} has no copy`)
    return { original, copy }
  })
}

/** The carry action's request from this job's page: a server action naming the sheet. */
function isCarryRequest(request: Request, serviceRecordId: string): boolean {
  return (
    request.method() === 'POST' &&
    Boolean(request.headers()['next-action']) &&
    (request.postData() ?? '').includes(serviceRecordId)
  )
}

async function openInspection(page: Page, inspectionId: string) {
  await page.goto(`/inspections/${inspectionId}`)
  await settle(page)
  const map = conditionMap(page)
  await expect(map).toBeVisible({ timeout: 30_000 })
  return map
}

test('confirming all makes the earlier marks this job’s own, with their note and photos', async ({
  page,
}) => {
  const car = await carWithTwoEarlierMarks('E2E carry')
  // A real photo on the earlier dent, uploaded the way the editor uploads one.
  const uploaded = await page.request.post('/api/protected/upload/service-files', {
    multipart: {
      file: { name: `e2e-carry-${stamp}.png`, mimeType: 'image/png', buffer: TINY_PNG },
    },
  })
  expect(uploaded.status()).toBe(200)
  const photo = ((await uploaded.json()) as { url: string }).url
  await setMarkPhotos(car.hood, [photo])

  // A job with no marks of its own prints no map yet.
  expect(printsMap(await workOrderPdf(page, car.later.serviceRecordId))).toBe(false)

  const map = await openDropoff(page, jobUrl(car.later))
  await expect(ownMarks(map)).toHaveCount(0)
  await expect(earlierMarks(map)).toHaveCount(2)
  await expect(glyphs(map)).toHaveCount(2)
  await expect(greyGlyphs(map)).toHaveCount(2)
  await expect(map.getByTestId('condition-map-confirm-all')).toHaveAttribute(
    'title',
    "Records them on this sheet as this visit's marks, in colour."
  )

  await confirmAll(map, car.vehicleId, 2)

  // On screen: the grey list is gone, the own list grew by two, the drawing is in colour.
  await expect(earlierSection(map)).toHaveCount(0)
  await expect(ownMarks(map)).toHaveCount(2)
  await expect(ownMarks(map).nth(0)).toHaveAccessibleName(/^Mark 1: Dent on the Bonnet/)
  await expect(ownMarks(map).nth(0)).toContainText(car.note)
  await expect(ownMarks(map).nth(1)).toHaveAccessibleName(/^Mark 2: Scratch on the Left front door/)
  await expect(glyphs(map)).toHaveCount(2)
  await expect(greyGlyphs(map)).toHaveCount(0)

  // In the database: each original closed and pointing at its copy, the copy
  // this job's and open, with everything the original said.
  const rows = await marksWithCarry(car.vehicleId)
  expect(rows).toHaveLength(4)
  for (const { original, copy } of carried(rows, [car.hood, car.door])) {
    expect(original.serviceRecordId).toBe(car.earlier.serviceRecordId)
    expect(original.resolvedAt).not.toBeNull()
    expect(copy).toMatchObject({
      serviceRecordId: car.later.serviceRecordId,
      inspectionId: null,
      inspectionItemId: null,
      resolvedAt: null,
      carriedToId: null,
      bodyType: original.bodyType,
      view: original.view,
      panel: original.panel,
      x: original.x,
      y: original.y,
      kind: original.kind,
      severity: original.severity,
      note: original.note,
      imageUrls: original.imageUrls,
    })
  }
  const [hood] = carried(rows, [car.hood])
  expect(hood.copy.note).toBe(car.note)
  expect(hood.copy.imageUrls).toEqual([photo])

  // A reload draws the same: this job's, in colour, its photo captioned as this visit's.
  const again = await openDropoff(page, jobUrl(car.later))
  await expect(ownMarks(again)).toHaveCount(2)
  await expect(earlierSection(again)).toHaveCount(0)
  await expect(greyGlyphs(again)).toHaveCount(0)
  await expect(
    page
      .getByTestId('condition-map-photos')
      .getByRole('button', { name: 'Photos of mark 1: 1. Dent on the Bonnet', exact: true })
  ).toBeVisible()

  // It is this sheet's to change now.
  await ownMarks(again).first().click()
  const editor = markEditor(page)
  await expect(editor).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Remove mark' })).toBeVisible()
  await expect(editor).not.toContainText(CARRIED_TEXT)
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  // And the work order prints them as its own, not as earlier ones.
  const pdf = await workOrderPdf(page, car.later.serviceRecordId)
  expect(printsMap(pdf), 'the job now has marks of its own').toBe(true)
  expect(pdf.flat).toContain('Bonnet')
  expect(pdf.flat).toContain('Left front door')
  expect(pdf.flat).toContain(car.note)
  expect(pdf.flat).not.toContain('recorded earlier')
})

test('the earlier job still shows and prints its marks as its own record, read only', async ({
  page,
}) => {
  const car = await carWithTwoEarlierMarks('E2E carry kept')
  await confirmAll(await openDropoff(page, jobUrl(car.later)), car.vehicleId, 2)

  const map = await openDropoff(page, jobUrl(car.earlier))
  await expect(ownMarks(map)).toHaveCount(2)
  await expect(earlierSection(map)).toHaveCount(0)
  await expect(ownMarks(map).nth(0)).toHaveAccessibleName(/^Mark 1: Dent on the Bonnet/)
  await expect(ownMarks(map).nth(1)).toHaveAccessibleName(/^Mark 2: Scratch on the Left front door/)
  await expect(glyphs(map)).toHaveCount(2)
  await expect(greyGlyphs(map)).toHaveCount(0)

  // Opened, it says where it lives on, and cannot be changed or removed here.
  await ownMarks(map).first().click()
  const editor = markEditor(page)
  await expect(editor).toBeVisible()
  await expect(editor).toContainText(CARRIED_TEXT)
  await expect(editor.getByRole('button', { name: 'Scratch' })).toBeDisabled()
  await expect(editor.getByRole('button', { name: 'Remove mark' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(editor).toBeHidden()

  // Its work order still prints the map with both, as this job's own.
  const pdf = await workOrderPdf(page, car.earlier.serviceRecordId)
  expect(printsMap(pdf), 'the earlier job keeps its map').toBe(true)
  expect(pdf.flat).toContain('Bonnet')
  expect(pdf.flat).toContain('Left front door')
  expect(pdf.flat).toContain(car.note)
  expect(pdf.flat).not.toContain('recorded earlier')

  // And the later one prints them as its own too.
  const later = await workOrderPdf(page, car.later.serviceRecordId)
  expect(printsMap(later)).toBe(true)
  expect(later.flat).toContain('Bonnet')
  expect(later.flat).toContain(car.note)
  expect(later.flat).not.toContain('recorded earlier')
})

test('the vehicle shows the dent once: a newer job meets the copies, not the originals', async ({
  page,
}) => {
  const car = await carWithTwoEarlierMarks('E2E carry once')
  await confirmAll(await openDropoff(page, jobUrl(car.later)), car.vehicleId, 2)
  const copies = carried(await marksWithCarry(car.vehicleId), [car.hood, car.door]).map(
    ({ copy }) => copy.id
  )

  // Today's job, the newest visit.
  const newest = await plantJobOnVehicle(organizationId, car.vehicleId, `E2E carry newest ${stamp}`)
  const map = await openDropoff(page, jobUrl(newest))
  await expect(ownMarks(map)).toHaveCount(0)
  await expect(earlierMarks(map)).toHaveCount(2)
  await expect(earlierSection(map).getByRole('button', { name: /on the Bonnet/ })).toHaveCount(1)
  await expect(
    earlierSection(map).getByRole('button', { name: /on the Left front door/ })
  ).toHaveCount(1)
  await expect(glyphs(map)).toHaveCount(2)
  await expect(greyGlyphs(map)).toHaveCount(2)

  // What is still open on the car is exactly the copies.
  const open = (await marksWithCarry(car.vehicleId)).filter((m) => !m.resolvedAt).map((m) => m.id)
  expect(open.sort()).toEqual([...copies].sort())

  // Its work order has nothing of its own to print, so no map.
  expect(printsMap(await workOrderPdf(page, newest.serviceRecordId))).toBe(false)
})

test('pressing it again from a tab opened before changes nothing', async ({ page }) => {
  const car = await carWithTwoEarlierMarks('E2E carry twice')
  // A second tab on the same job, opened while the marks were still earlier ones.
  const stale = await page.context().newPage()
  const staleMap = await openDropoff(stale, jobUrl(car.later))
  await expect(earlierMarks(staleMap)).toHaveCount(2)

  await confirmAll(await openDropoff(page, jobUrl(car.later)), car.vehicleId, 2)
  const before = await marksWithCarry(car.vehicleId)
  expect(before).toHaveLength(4)

  // The stale tab still offers the button; pressing it reaches the server and takes nothing.
  const button = staleMap.getByTestId('condition-map-confirm-all')
  await expect(button).toBeVisible()
  const answered = stale.waitForResponse((response) =>
    isCarryRequest(response.request(), car.later.serviceRecordId)
  )
  await button.click()
  await answered

  await expect
    .poll(async () => (await marksWithCarry(car.vehicleId)).length, {
      message: 'no further marks were written',
    })
    .toBe(4)
  const after = await marksWithCarry(car.vehicleId)
  expect(after.map((m) => [m.id, m.carriedToId, m.resolvedAt?.toISOString() ?? null])).toEqual(
    before.map((m) => [m.id, m.carriedToId, m.resolvedAt?.toISOString() ?? null])
  )

  // Both tabs, reloaded, show the same two marks as this job's own.
  for (const tab of [page, stale]) {
    const map = await openDropoff(tab, jobUrl(car.later))
    await expect(ownMarks(map)).toHaveCount(2)
    await expect(earlierSection(map)).toHaveCount(0)
  }
  await stale.close()
})

test('a tab that confirms what another already confirmed shows them as this job’s', async ({
  page,
}) => {
  const car = await carWithTwoEarlierMarks('E2E carry stale')
  const stale = await page.context().newPage()
  const staleMap = await openDropoff(stale, jobUrl(car.later))
  await expect(earlierMarks(staleMap)).toHaveCount(2)

  await confirmAll(await openDropoff(page, jobUrl(car.later)), car.vehicleId, 2)

  const answered = stale.waitForResponse((response) =>
    isCarryRequest(response.request(), car.later.serviceRecordId)
  )
  await staleMap.getByTestId('condition-map-confirm-all').click()
  await answered

  // Without a reload: the marks are this job's now, whoever pressed first,
  // so the tab should not go on offering them as earlier ones.
  await expect(ownMarks(staleMap)).toHaveCount(2)
  await expect(earlierSection(staleMap)).toHaveCount(0)
  await stale.close()
})

test('a mark cleared as repaired leaves its own sheet; a confirmed one stays there', async ({
  page,
}) => {
  const car = await carWithTwoEarlierMarks('E2E carry repaired')
  const map = await openDropoff(page, jobUrl(car.later))

  // The bonnet was repaired; the scratch is still there.
  const grey = earlierSection(map)
  await grey
    .getByRole('listitem')
    .filter({ hasText: 'Bonnet' })
    .getByRole('button', { name: 'Clear as repaired' })
    .click()
  const confirm = page.getByRole('alertdialog', { name: 'Clear as repaired' })
  await confirm.getByRole('button', { name: 'Clear as repaired' }).click()
  await expect(confirm).toBeHidden()
  await expect(earlierMarks(map)).toHaveCount(1)
  await expect
    .poll(async () => (await marksWithCarry(car.vehicleId)).find((m) => m.id === car.hood))
    .toMatchObject({ resolvedAt: expect.any(Date), carriedToId: null })

  await confirmAll(map, car.vehicleId, 1)
  await expect(ownMarks(map)).toHaveCount(1)
  await expect(ownMarks(map).first()).toHaveAccessibleName(/on the Left front door/)

  // The earlier job keeps the confirmed scratch and has lost the repaired dent.
  const earlier = await openDropoff(page, jobUrl(car.earlier))
  await expect(ownMarks(earlier)).toHaveCount(1)
  await expect(ownMarks(earlier).first()).toHaveAccessibleName(/on the Left front door/)
})

test.describe('on an inspection’s map check', () => {
  test('confirming all records them on the check and leaves the earlier job its record', async ({
    page,
  }) => {
    const earlier = await plantConditionJob(
      organizationId,
      userId,
      `E2E carry inspection earlier ${stamp}`,
      new Date(Date.now() - 30 * DAY)
    )
    const note = `Chip by the mirror ${stamp}`
    const hood = await plantConditionMark(
      organizationId,
      earlier.vehicleId,
      { serviceRecordId: earlier.serviceRecordId },
      { view: 'top', panel: 'hood', kind: 'dent', recordedAt: new Date(Date.now() - 30 * DAY) }
    )
    const door = await plantConditionMark(
      organizationId,
      earlier.vehicleId,
      { serviceRecordId: earlier.serviceRecordId },
      {
        view: 'right',
        panel: 'right_front_door',
        kind: 'chip',
        note,
        recordedAt: new Date(Date.now() - 30 * DAY + 60_000),
      }
    )
    // Today's inspection on the same car, not linked to that job.
    const inspection = await plantConditionInspection(
      organizationId,
      earlier.vehicleId,
      `E2E carry ${stamp}`
    )

    const map = await openInspection(page, inspection.inspectionId)
    await expect(ownMarks(map)).toHaveCount(0)
    await expect(earlierMarks(map)).toHaveCount(2)
    await expect(greyGlyphs(map)).toHaveCount(2)

    await confirmAll(map, earlier.vehicleId, 2)
    await expect(ownMarks(map)).toHaveCount(2)
    await expect(earlierSection(map)).toHaveCount(0)
    await expect(greyGlyphs(map)).toHaveCount(0)
    await expect(ownMarks(map).nth(1)).toContainText(note)

    // The copies are the check's, the originals closed and pointing at them.
    const rows = await marksWithCarry(earlier.vehicleId)
    expect(rows).toHaveLength(4)
    for (const { original, copy } of carried(rows, [hood, door])) {
      expect(original.resolvedAt).not.toBeNull()
      expect(copy).toMatchObject({
        serviceRecordId: null,
        inspectionId: inspection.inspectionId,
        inspectionItemId: inspection.inspectionItemId,
        resolvedAt: null,
        view: original.view,
        panel: original.panel,
        kind: original.kind,
        severity: original.severity,
        note: original.note,
      })
    }

    // A reload keeps them on the check.
    const again = await openInspection(page, inspection.inspectionId)
    await expect(ownMarks(again)).toHaveCount(2)
    await expect(earlierSection(again)).toHaveCount(0)

    // The certificate prints them as the inspection's own.
    const certificate = await certificatePdf(page, inspection.inspectionId)
    expect(printsMap(certificate)).toBe(true)
    expect(certificate.flat).toContain('Right front door')
    expect(certificate.flat).toContain(note)

    // The earlier job still holds them as its own record, read only, and prints them.
    const onJob = await openDropoff(page, jobUrl(earlier))
    await expect(ownMarks(onJob)).toHaveCount(2)
    await expect(earlierSection(onJob)).toHaveCount(0)
    await ownMarks(onJob).nth(1).click()
    const editor = markEditor(page)
    await expect(editor).toContainText(CARRIED_TEXT)
    await expect(editor.getByRole('button', { name: 'Remove mark' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    const pdf = await workOrderPdf(page, earlier.serviceRecordId)
    expect(printsMap(pdf)).toBe(true)
    expect(pdf.flat).toContain('Right front door')
    expect(pdf.flat).toContain(note)
  })
})
