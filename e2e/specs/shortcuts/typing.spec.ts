import { expect, type Locator, type Page, test } from '@playwright/test'
import { jobWithCustomer, ownerOrganizationId, setKeyboardShortcuts } from '../../support/db'
import { settle } from '../../support/hydration'
import { newWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * Typing never runs a shortcut.
 *
 * The only bare-key shortcuts left are the calendar's single letters; going
 * to a page is Alt+G, then Alt and a letter, which cannot be typed. The owner
 * has every shortcut on and types sentences made of exactly those letters
 * into the places a workshop types all day. The words must arrive and the
 * address must not change.
 *
 * The unit tests (src/__tests__/features/shortcuts/typing-safety.test.tsx)
 * hold the same promise against each component in jsdom; this file holds it
 * in a real browser, with real focus and real key events.
 */

test.describe.configure({ mode: 'serial' })

const OWNER = 'demo@torqvoice.com'
/** Every letter a bare-key shortcut uses, as words. */
const SENTENCE = 'gw gq gd dwmyax tjnkp'

test.beforeAll(async () => {
  await setKeyboardShortcuts(OWNER, {
    enabled: true,
    singleKeys: true,
    goToSequences: true,
    overrides: {},
    disabled: [],
  })
})

test.afterAll(async () => {
  await setKeyboardShortcuts(OWNER, null)
})

/** Types at a person's pace into a field and checks the page did not move. */
async function typeAndStay(page: Page, field: Locator, read: () => Promise<string>) {
  await field.scrollIntoViewIfNeeded()
  await field.click()
  const before = page.url()
  await page.keyboard.type(SENTENCE, { delay: 80 })
  // Long enough for a held-back shortcut or a navigation to show itself.
  await page.waitForTimeout(700)
  expect(page.url()).toBe(before)
  expect(await read()).toContain(SENTENCE)
}

test('Alt+G then Alt+W opens the work orders, and the bare letters open nothing', async ({
  page,
}) => {
  await page.goto('/customers')
  await settle(page)
  const before = page.url()
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  await page.keyboard.type('gw gq gg', { delay: 120 })
  await page.waitForTimeout(700)
  expect(page.url()).toBe(before)

  await expect(async () => {
    await page.keyboard.press('Alt+g')
    await page.keyboard.press('Alt+w')
    await page.waitForURL(/\/work-orders$/, { timeout: 5_000 })
  }).toPass({ timeout: 30_000 })
})

test('a settings field keeps every letter', async ({ page }) => {
  await page.goto('/settings/company')
  await settle(page)
  const field = page.getByRole('textbox').first()
  await field.fill('')
  await typeAndStay(page, field, () => field.inputValue())
  // The form is left unsaved on purpose: nothing about the workshop changes.
})

test('the search palette keeps every letter', async ({ page }) => {
  await page.goto('/customers')
  await settle(page)
  await page.keyboard.press('Control+k')
  const field = page.getByRole('dialog').getByRole('combobox')
  await expect(field).toBeVisible()
  await typeAndStay(page, field, () => field.inputValue())
})

test('a field in a dialog keeps every letter, and the page behind stays put', async ({ page }) => {
  await page.goto('/customers?create=true')
  await settle(page)
  const dialog = page
    .getByRole('dialog')
    .filter({ has: page.getByRole('textbox') })
    .last()
  const field = dialog.getByRole('textbox').first()
  await typeAndStay(page, field, () => field.inputValue())
  // With the dialog open and the focus off the field, bare keys still do nothing.
  const before = page.url()
  await dialog.getByRole('heading').first().click()
  await page.keyboard.type('gw', { delay: 120 })
  await page.waitForTimeout(700)
  expect(page.url()).toBe(before)
})

test('a work order note and its rich text keep every letter', async ({ page }) => {
  const vehicleUrl = await seededVehicleUrl(page)
  await newWorkOrder(page, vehicleUrl, `Shortcut typing ${Date.now()}`)

  const note = page.locator('textarea').filter({ visible: true }).first()
  await typeAndStay(page, note, () => note.inputValue())

  const editor = page.locator('[contenteditable="true"]').filter({ visible: true }).first()
  if (await editor.count()) {
    await typeAndStay(page, editor, async () => (await editor.textContent()) ?? '')
  }
})

test('the message box keeps every letter', async ({ page }) => {
  const job = await jobWithCustomer(await ownerOrganizationId())
  await page.goto(`/messages?customerId=${job.customerId}`)
  await settle(page)
  const box = page.locator('textarea').filter({ visible: true }).last()
  await typeAndStay(page, box, () => box.inputValue())
  // Typed, never sent: no customer hears from this spec.
  await box.fill('')
})

test('a scan with no field focused opens nothing', async ({ page }) => {
  await page.goto('/customers')
  await settle(page)
  const before = page.url()
  // No delay: the characters arrive as a scanner sends them.
  await page.keyboard.type('gw4471')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(700)
  expect(page.url()).toBe(before)
})

test('the shortcuts settings page scrolls its list, never the whole page', async ({ page }) => {
  // The settings layout is one screen tall and only its panes scroll. A
  // visually hidden element laid out against the page once stretched the
  // document to three screens here: scrolled to the end of the list, the
  // wheel carried on and took the header and the menu off the top.
  await page.goto('/settings/shortcuts')
  await settle(page)
  const lastRow = page.getByRole('button', { name: 'Change the shortcut for Previous period' })
  await lastRow.scrollIntoViewIfNeeded()
  await lastRow.hover()
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 2_000)
  await page.waitForTimeout(500)

  const measured = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }))
  expect(measured.scrollY).toBe(0)
  expect(measured.scrollHeight).toBeLessThanOrEqual(measured.innerHeight)
  expect(measured.scrollWidth).toBeLessThanOrEqual(measured.innerWidth)
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeInViewport()

  // The same with the help overlay open on top of it.
  await page.keyboard.press('Control+/')
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
  const withOverlay = await page.evaluate(() => ({
    scrollY: window.scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight: window.innerHeight,
  }))
  expect(withOverlay.scrollY).toBe(0)
  expect(withOverlay.scrollHeight).toBeLessThanOrEqual(withOverlay.innerHeight)
})
