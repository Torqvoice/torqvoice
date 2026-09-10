import { expect, type Page, test } from '@playwright/test'
import { settle } from '../../support/hydration'
import { setWorkshopClock } from '../../support/settings'

/**
 * A booking keeps the time it was made at.
 *
 * This is the one part of the app where a mocked test cannot help. Every
 * wall-clock bug here has the same shape: a time is written down in one
 * timezone and read back in another, and the job that was booked for half past
 * ten turns up at half past twelve. It has happened in this codebase, which is
 * why `src/lib/workshop-datetime.ts` exists and why the suite pins one
 * timezone for the browser and the server.
 *
 * The trick that makes this checkable is that the calendar names the time it
 * thinks you clicked: right-click a slot and the menu offers "New work order
 * at 10:30". So the test never has to know which slot it hit — it reads back
 * the app's own answer and then holds every other screen to it.
 *
 * Run against a workshop timezone deliberately far from the server's, because
 * agreeing with itself in one zone proves nothing.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
/** Half a world from the Europe/Oslo the harness runs in. */
const FAR_AWAY = 'Pacific/Auckland'

/** The time the calendar offered, as it wrote it. */
let offered = ''
let jobUrl = ''

/** The day column for a date the grid is showing, in day or week view. */
async function dayColumn(page: Page) {
  const columns = page.locator('[data-testid^="timegrid-day-"]')
  await expect(columns.first()).toBeVisible({ timeout: 30_000 })
  return columns.first()
}

async function openDayView(page: Page) {
  await page.goto('/calendar')
  await settle(page)
  // The views have single-key shortcuts, which is both what a service adviser
  // uses all day and the steadiest way in: the switcher itself is a dropdown
  // whose trigger is named after whichever view is showing.
  await expect(async () => {
    await page.keyboard.press('d')
    await expect(page.locator('[data-testid^="timegrid-day-"]').first()).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  // A 24-hour clock as well, so the calendar and the schedule field write a
  // time the same way and a comparison between them means something.
  await setWorkshopClock(page, { timezone: FAR_AWAY, format: '24h' })
  await page.close()
})

test.afterAll(async ({ browser }) => {
  // Back to the browser's own, which is what the rest of the suite expects.
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setWorkshopClock(page, { timezone: '', format: '12h' })
  await page.close()
})

test.describe('booking a job from the calendar', () => {
  test('the calendar names the time under the pointer', async ({ page }) => {
    await openDayView(page)

    const column = await dayColumn(page)
    const box = await column.boundingBox()
    expect(box, 'the day column is on screen').not.toBeNull()

    // Somewhere in the working day. Which slot does not matter: what matters
    // is that the app says which one it was.
    await column.click({
      button: 'right',
      position: { x: Math.min(40, box!.width / 2), y: box!.height * 0.45 },
    })

    const item = page.getByRole('menuitem', { name: /new work order at/i }).first()
    await expect(item).toBeVisible({ timeout: 10_000 })
    offered = ((await item.innerText()).match(/(\d{1,2}[:.]\d{2})/) ?? [])[1] ?? ''
    expect(offered, 'the menu names a time').toMatch(/\d{1,2}[:.]\d{2}/)
  })

  test('the work order it creates starts at that time', async ({ page }) => {
    await openDayView(page)
    const column = await dayColumn(page)
    const box = await column.boundingBox()

    await column.click({
      button: 'right',
      position: { x: Math.min(40, box!.width / 2), y: box!.height * 0.45 },
    })
    const item = page.getByRole('menuitem', { name: /new work order at/i }).first()
    await expect(item).toBeVisible({ timeout: 10_000 })
    const named = ((await item.innerText()).match(/(\d{1,2}[:.]\d{2})/) ?? [])[1] ?? ''
    expect(named, 'the same time as before').toBe(offered)
    await item.click()

    // It asks which vehicle before it can make anything.
    const picker = page.getByRole('dialog', { name: /select vehicle for work order/i })
    await expect(picker).toBeVisible({ timeout: 30_000 })
    await picker.getByText(/Camry/i).first().click()

    await page.waitForURL(
      (url) => /\/service\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'),
      { timeout: 30_000 }
    )
    jobUrl = page.url()

    // The schedule card prints the start as a date and a 24-hour clock, and
    // the clock has to be the one the calendar offered.
    await expect(page.getByText(new RegExp(offered.replace('.', '[:.]')))).toBeVisible({
      timeout: 30_000,
    })

    await page.locator('input[name="title"]').fill(`E2E booking ${stamp}`)
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  })

  test('and still starts at that time after a reload', async ({ page }) => {
    await page.goto(jobUrl)
    await settle(page)
    // The round trip through the database and back out again, which is where a
    // wall clock gets converted twice and comes back wrong.
    await expect(page.getByText(new RegExp(offered.replace('.', '[:.]')))).toBeVisible()
  })

  test('and the calendar shows it where it put it', async ({ page }) => {
    await openDayView(page)

    // The chip's tooltip is the times it was drawn at, which is the reading
    // that matters: the block is positioned from the same string. Read rather
    // than clicked, because a day with several bookings in one slot draws
    // them on top of each other and a click lands on whichever is in front.
    const chip = page.locator(`[title*="E2E booking ${stamp}"]`).first()
    await expect(chip).toBeVisible({ timeout: 30_000 })
    await expect(chip, 'the chip is drawn at the time the menu offered').toHaveAttribute(
      'title',
      new RegExp(`^${offered.replace('.', '[:.]')}\\b`)
    )
  })

  test('the workshop’s own timezone is what the times are read in', async ({ page }) => {
    // Moved to the other side of the world, the same instant is a different
    // wall clock — and the calendar has to say the new one, because the
    // workshop's clock is the one its bookings are kept in.
    await setWorkshopClock(page, { timezone: 'America/Los_Angeles' })

    await page.goto(jobUrl)
    await settle(page)
    const shown = await page.locator('body').innerText()
    expect(
      shown.includes(offered),
      `the start reads differently in another timezone (was ${offered})`
    ).toBe(false)

    await setWorkshopClock(page, { timezone: FAR_AWAY })
    await page.goto(jobUrl)
    await settle(page)
    // And back again: the stored instant never moved.
    await expect(page.getByText(new RegExp(offered.replace('.', '[:.]')))).toBeVisible()
  })
})
