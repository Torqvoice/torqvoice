import { expect, type Page, test } from '@playwright/test'
import { deleteRemindersTitled, reminderDueDate } from '../../support/db'
import { settle } from '../../support/hydration'
import { setWorkshopClock } from '../../support/settings'
import { seededVehicleUrl } from '../../support/work-order'

/**
 * A reminder due at half past two is due at half past two tomorrow as well.
 *
 * The trap here is not the storing, it is the editing. A due date is handed
 * to the server as a wall clock ("2026-09-11T14:30") and read in the
 * workshop's zone, while the two fields that produce that string were filled
 * from whatever zone the browser happens to be in. Where the two agree, and
 * they do on every developer's laptop, nothing looks wrong. Where they do not,
 * the form opens on the wrong time and saving it moves the reminder, without
 * anyone touching the field.
 *
 * So the workshop is put somewhere far from the browser and one reminder is
 * followed through creation, display, the edit form, and a save that changes
 * nothing. The last of those is the assertion that matters: reopening and
 * saving a reminder has to leave it where it was.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const TITLE = `E2E reminder ${stamp}`
/** Far from the harness's Europe/Oslo, and on the other side of a date line. */
const FAR_AWAY = 'Pacific/Auckland'

/** The wall clock the calendar slot stood for, as the form was seeded with it. */
let due = ''

/** The reminders list, hydrated. */
async function openReminders(page: Page) {
  await page.goto('/reminders')
  await settle(page)
}

/**
 * The row for this spec's reminder: the innermost element holding both its
 * title and its own menu button, which is the row and not the whole list.
 */
function reminderRow(page: Page) {
  return page
    .locator('div')
    .filter({ has: page.getByText(TITLE, { exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Open menu' }) })
    .last()
}

/** Opens the edit dialog from the row's own menu. */
async function openEdit(page: Page) {
  const row = reminderRow(page)
  await expect(async () => {
    await row.getByRole('button', { name: 'Open menu' }).first().click()
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.getByRole('menuitem', { name: 'Edit' }).click()
  await expect(page.getByRole('dialog', { name: 'Edit Reminder' })).toBeVisible()
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setWorkshopClock(page, { timezone: FAR_AWAY, format: '24h' })
  await page.close()
})

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setWorkshopClock(page, { timezone: '', format: '12h' })
  await page.close()
})

test.describe('a reminder due at a time of day', () => {
  test('is booked at the time the calendar slot named', async ({ page }) => {
    // A day nothing is booked on: a right-click that lands on a chip opens
    // that job's menu, not the empty slot's.
    const day = new Date(Date.now() + 45 * 86_400_000)
    const empty = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`
    await page.goto(`/calendar?view=day&date=${empty}`)
    await settle(page)
    await expect(async () => {
      await page.keyboard.press('d')
      await expect(page.locator('[data-testid^="timegrid-day-"]').first()).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    const column = page.locator('[data-testid^="timegrid-day-"]').first()
    const box = await column.boundingBox()
    await column.click({
      button: 'right',
      position: { x: Math.min(40, box!.width / 2), y: box!.height * 0.45 },
    })
    await page.getByRole('menuitem', { name: 'New reminder' }).click()

    const dialog = page.getByRole('dialog', { name: 'Add Reminder' })
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    // The slot the pointer was on, seeded into the form by the calendar. The
    // spec never picks the time itself: it reads back what the app offered.
    due = await dialog.locator('#reminder-time').inputValue()
    expect(due, 'the calendar seeded a time').toMatch(/^\d{2}:\d{2}$/)

    await dialog.locator('#reminder-title').fill(TITLE)
    await dialog.getByRole('button', { name: 'Add Reminder', exact: true }).click()
    await expect(page.getByText('Reminder created')).toBeVisible({ timeout: 30_000 })

    // What was stored is that wall clock in the workshop's zone, whatever the
    // browser's zone is. Read from the database, so the check does not lean
    // on the same formatting the page uses.
    const stored = await reminderDueDate(TITLE)
    const inWorkshop = new Intl.DateTimeFormat('en-GB', {
      timeZone: FAR_AWAY,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(stored)
    expect(inWorkshop, 'stored as the workshop reads it').toBe(due)
  })

  test('is listed at that time', async ({ page }) => {
    await openReminders(page)
    await expect(reminderRow(page).getByText(due)).toBeVisible()
  })

  test('opens on that time in the edit form', async ({ page }) => {
    await openReminders(page)
    await openEdit(page)

    // The field a person would look at before deciding whether to change
    // anything. Filled from the browser's clock, this read thirteen hours out.
    await expect(page.locator('#reminder-time')).toHaveValue(due)
  })

  test('and a save that changes nothing leaves it where it was', async ({ page }) => {
    const before = await reminderDueDate(TITLE)

    await openReminders(page)
    await openEdit(page)
    await page
      .getByRole('dialog', { name: 'Edit Reminder' })
      .getByRole('button', { name: 'Save Changes', exact: true })
      .click()
    await expect(page.getByText('Reminder updated')).toBeVisible({ timeout: 30_000 })

    expect((await reminderDueDate(TITLE)).getTime(), 'the reminder did not move').toBe(
      before.getTime()
    )
    await openReminders(page)
    await expect(reminderRow(page).getByText(due)).toBeVisible()
  })

  test('and is tidied away again', async ({ page }) => {
    // The calendar and the reminder list are read by other specs; this one
    // does not leave a reminder sitting in them.
    await openReminders(page)
    const row = reminderRow(page)
    await expect(async () => {
      await row.getByRole('button', { name: 'Open menu' }).first().click()
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('menuitem', { name: 'Delete' }).click()
    await expect(page.getByText('Reminder deleted')).toBeVisible({ timeout: 30_000 })
  })
})

test.describe('the same reminder, from the vehicle it belongs to', () => {
  /**
   * A second form, on the vehicle's own reminders tab, filling the same two
   * fields from the same stored instant. It had the same defect, and one form
   * being right says nothing about the other.
   */
  const VEHICLE_TITLE = `E2E vehicle reminder ${stamp}`
  const AT = '15:45'

  test('is opened on the workshop clock there too', async ({ page }) => {
    const vehicleUrl = await seededVehicleUrl(page)
    await page.goto(`${vehicleUrl}?tab=reminders`)
    await settle(page)

    await expect(async () => {
      await page.getByRole('button', { name: 'Add Reminder' }).first().click()
      await expect(page.getByRole('dialog', { name: 'Add Reminder' })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })

    const dialog = page.getByRole('dialog', { name: 'Add Reminder' })
    await dialog.locator('#reminder-title').fill(VEHICLE_TITLE)
    // A day far enough ahead that "overdue" cannot change what the row says.
    await dialog.locator('#reminder-dueDate').fill('2027-03-15')
    await dialog.locator('#reminder-dueTime').fill(AT)
    await dialog.getByRole('button', { name: 'Add Reminder', exact: true }).click()
    await expect(page.getByText('Reminder created')).toBeVisible({ timeout: 30_000 })

    // Typed as the workshop's clock, so that is the instant that was stored.
    const stored = await reminderDueDate(VEHICLE_TITLE)
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: FAR_AWAY,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(stored)
    ).toBe(AT)

    // And reopening shows what was typed, rather than the same instant read
    // on the clock of whoever opened it.
    await page.reload()
    await settle(page)
    const row = page
      .locator('div')
      .filter({ has: page.getByText(VEHICLE_TITLE, { exact: true }) })
      .filter({ has: page.getByRole('button', { name: 'Open menu' }) })
      .last()
    await expect(async () => {
      await row.getByRole('button', { name: 'Open menu' }).first().click()
      await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.getByRole('menuitem', { name: 'Edit' }).click()

    const edit = page.getByRole('dialog', { name: 'Edit Reminder' })
    await expect(edit).toBeVisible()
    // Empty here is not a cosmetic problem: saving the form as it opens sends
    // "no time", which rewrites the reminder to midday and drops the hour the
    // workshop chose.
    await expect(edit.locator('#reminder-dueTime')).toHaveValue(AT)
    await expect(edit.locator('#reminder-dueDate')).toHaveValue(/15/)

    await edit.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(page.getByText('Reminder updated')).toBeVisible({ timeout: 30_000 })

    // The whole point: opening and saving changed nothing.
    const after = await reminderDueDate(VEHICLE_TITLE)
    expect(after.getTime()).toBe(stored.getTime())
  })

  test('and is tidied away', async () => {
    await deleteRemindersTitled(VEHICLE_TITLE)
  })
})
