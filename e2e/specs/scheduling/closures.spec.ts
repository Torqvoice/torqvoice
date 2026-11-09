import { expect, test } from '@playwright/test'
import {
  absencesOf,
  closuresNamed,
  deleteClosuresNamed,
  deleteTechnicians,
  insertTechnician,
  ownerOrganizationId,
} from '../../support/db'
import { fillSettled, settle } from '../../support/hydration'

/**
 * Leave and closed days, from where they are entered to the work board.
 *
 * A technician set on leave from the board's own Leave button shows as away
 * in their lane, and a closed day added under Settings → Opening hours and
 * holidays is named in the board's day header. Both are what a service
 * advisor looks at before handing out work; nothing here stops a booking.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const TECH = `E2E Leave ${stamp}`
const CLOSURE = `E2E Closed ${stamp}`

/** A Wednesday a week or two out: always a working day, never today. */
function nextWednesday(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7 + ((3 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
}
const DAY = nextWednesday()
/** The board's week starts on Monday unless the workshop says otherwise. */
const WEEK = new Date(Date.parse(`${DAY}T12:00:00Z`) - 2 * 86_400_000).toISOString().slice(0, 10)
const BOARD = `/work-board?view=week&week=${WEEK}&date=${DAY}&group=technician`

let technicianId = ''

test.beforeAll(async () => {
  technicianId = await insertTechnician(await ownerOrganizationId(), TECH)
})

test.afterAll(async () => {
  await deleteClosuresNamed(CLOSURE)
  // Time off goes with the technician.
  if (technicianId) await deleteTechnicians([technicianId])
})

test('a technician set on leave from the board shows as away in their lane', async ({ page }) => {
  await page.goto(BOARD)
  await settle(page)

  await expect(async () => {
    await page.getByRole('button', { name: 'Leave', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Leave and out of office' })).toBeVisible()
  }).toPass()
  await page.getByRole('button', { name: 'Set on leave or out of office' }).click()

  const dialog = page.getByRole('dialog', { name: 'Set on leave or out of office' })
  await dialog.getByLabel('Technician').click()
  await page.getByRole('option', { name: TECH }).click()
  await fillSettled(dialog.locator('#time-off-from'), DAY)
  await dialog.locator('#time-off-from').press('Tab')
  await fillSettled(dialog.locator('#time-off-to'), DAY)
  await dialog.locator('#time-off-to').press('Tab')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await expect
    .poll(() => absencesOf(technicianId))
    .toEqual([{ startDate: DAY, endDate: DAY, reason: 'holiday', startTime: null }])

  // The manager lists it, then the board says so in the lane.
  const manager = page.getByRole('dialog', { name: 'Leave and out of office' })
  await expect(manager.getByTestId('time-off-row').filter({ hasText: TECH })).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(
    page.getByTestId('lane-away').filter({ hasText: 'On leave' }).filter({ visible: true }).first()
  ).toBeVisible()
})

test('a closed day added in settings is named on the board', async ({ page }) => {
  await page.goto('/settings/opening-hours')
  await settle(page)

  await expect(async () => {
    await page.getByRole('button', { name: 'Add closed day' }).click()
    await expect(page.getByRole('dialog', { name: 'Add closed day' })).toBeVisible()
  }).toPass()
  const dialog = page.getByRole('dialog', { name: 'Add closed day' })
  await fillSettled(dialog.getByLabel('Name'), CLOSURE)
  await fillSettled(dialog.locator('#closure-from'), DAY)
  await dialog.locator('#closure-from').press('Tab')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  await expect
    .poll(() => closuresNamed(CLOSURE))
    .toEqual([{ startDate: DAY, endDate: DAY, repeatsYearly: false }])
  await expect(page.getByTestId('closure-row').filter({ hasText: CLOSURE })).toBeVisible()

  await page.goto(BOARD)
  await settle(page)
  await expect(
    page
      .getByTestId('day-closed')
      .filter({ hasText: `Closed: ${CLOSURE}` })
      .first()
  ).toBeVisible()
})
