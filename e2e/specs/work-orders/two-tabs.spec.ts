import { expect, type Locator, type Page, test } from '@playwright/test'
import { highestReadingForJob, jobNotesAndReading } from '../../support/db'
import { fillSettled, settle } from '../../support/hydration'
import { jobIdOf, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * The same work order open in two tabs of one browser.
 *
 * The page used to save its whole form, so the tab opened earlier wrote back
 * every field as it had first read it: a note saved in the other tab was gone
 * the moment this one saved its mileage. Each save now sends only the fields
 * its tab changed. When both tabs change the same field the later save wins,
 * and the tab that lost is told so on its own screen.
 */

// Two work order pages at once, which is more than the default budget on a cold server.
test.describe.configure({ mode: 'serial', timeout: 120_000 })

const stamp = Date.now()

async function openJob(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await settle(page)
  await expect(page.getByTestId('service-layout-modern')).toBeVisible()
}

/** Types at the end of a notes box, as modern-page.spec.ts does. */
async function typeInNotes(page: Page, card: Locator, text: string): Promise<void> {
  const area = card.getByTestId('rich-text-area')
  const editor = card.locator('.ProseMirror')
  await expect(async () => {
    const box = await area.boundingBox()
    if (!box) throw new Error('notes box not on screen')
    await area.click({ position: { x: box.width / 2, y: box.height - 12 } })
    await expect(editor).toBeFocused({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.keyboard.press('End')
  await page.keyboard.type(text)
  await expect(editor).toContainText(text)
}

test('a note saved in one tab survives a mileage saved in the other', async ({ page }) => {
  const url = await newWorkOrder(page, await seededVehicleUrl(page), `E2E two tabs ${stamp}`)
  const jobId = jobIdOf(url)
  const tabA = page
  const tabB = await page.context().newPage()
  await openJob(tabB, url)

  const note = `Customer hears a rattle ${stamp}`
  await typeInNotes(tabB, tabB.getByTestId('notes-internal'), note)
  await saveWorkOrder(tabB)
  await expect.poll(async () => (await jobNotesAndReading(jobId)).diagnosticNotes).toContain(note)

  // Tab A was opened before the note was written.
  const reading = (await highestReadingForJob(jobId)) + 25
  await fillSettled(tabA.locator('input[name="mileage"]'), String(reading))
  await saveWorkOrder(tabA)

  await expect.poll(async () => (await jobNotesAndReading(jobId)).mileage).toBe(reading)
  expect((await jobNotesAndReading(jobId)).diagnosticNotes).toContain(note)

  await tabA.reload()
  await settle(tabA)
  await expect(tabA.getByTestId('notes-internal').locator('.ProseMirror')).toContainText(note)
  await expect(tabA.locator('input[name="mileage"]')).toHaveValue(String(reading))
  await tabB.close()
})

test('the later save of the same note wins, and the other tab is told', async ({ page }) => {
  const url = await newWorkOrder(page, await seededVehicleUrl(page), `E2E two tabs same ${stamp}`)
  const jobId = jobIdOf(url)
  const tabA = page
  const tabB = await page.context().newPage()
  await openJob(tabB, url)

  const first = `Tab B thinks it is the caliper ${stamp}`
  await typeInNotes(tabB, tabB.getByTestId('notes-internal'), first)
  await saveWorkOrder(tabB)
  await expect.poll(async () => (await jobNotesAndReading(jobId)).diagnosticNotes).toContain(first)

  const later = `Tab A found a seized slide pin ${stamp}`
  await typeInNotes(tabA, tabA.getByTestId('notes-internal'), later)
  await saveWorkOrder(tabA)
  await expect.poll(async () => (await jobNotesAndReading(jobId)).diagnosticNotes).toContain(later)

  // Tab B hears of the save, shows the newer note, and says its own was replaced.
  const banner = tabB.getByTestId('changed-elsewhere-banner')
  await expect(banner).toContainText('Changed elsewhere: Internal notes.', { timeout: 30_000 })
  await expect(tabB.getByTestId('notes-internal').locator('.ProseMirror')).toContainText(later)
  await banner.getByRole('button', { name: 'OK' }).click()
  await expect(banner).toHaveCount(0)
  await tabB.close()
})
