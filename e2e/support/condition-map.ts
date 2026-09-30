import { expect, type Locator, type Page } from '@playwright/test'
import { settle } from './hydration'
import { type PdfContent, pdfContent } from './pdf'

/**
 * Driving the vehicle condition map: the drawing on a work order's Drop-off
 * tab and on an inspection's condition map check, the mark editor, and the
 * documents that print it.
 *
 * A mark is added by clicking a panel of the drawing. Every panel is an SVG
 * path carrying its view and panel id, so a spec names the panel it means
 * rather than aiming at pixels. The click creates the mark at once, with the
 * first kind on offer, and opens the editor on it; the editor saves each
 * change as it is made.
 */

/** The map card on the page (one per work order, one per map check). */
export function conditionMap(page: Page): Locator {
  return page.getByTestId('condition-map').first()
}

/** Opens the job's Drop-off tab and waits for its map. */
export async function openDropoff(page: Page, jobUrl: string): Promise<Locator> {
  await page.goto(jobUrl)
  await settle(page)
  const files = page.getByTestId('files-media')
  const tab = files.getByRole('tab', { name: /^Drop-off/ })
  await expect(async () => {
    await tab.click()
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  const map = conditionMap(page)
  await expect(map).toBeVisible()
  return map
}

/** The count on the Drop-off tab: its photos and this visit's marks. */
export function dropoffTab(page: Page): Locator {
  return page.getByTestId('files-media').getByRole('tab', { name: /^Drop-off/ })
}

/** The mark editor, whichever mark it is open on. */
export function markEditor(page: Page): Locator {
  return page.getByRole('dialog').filter({ has: page.getByRole('group', { name: 'Severity' }) })
}

/**
 * Clicks a panel of the drawing and returns the editor the new mark opens in.
 * Repeated until the editor opens: a click before hydration does nothing.
 */
export async function addMark(
  page: Page,
  map: Locator,
  view: 'top' | 'left' | 'right' | 'front' | 'rear',
  panel: string
): Promise<Locator> {
  const target = map.locator(`path[data-view="${view}"][data-panel="${panel}"]`)
  const editor = markEditor(page)
  await expect(async () => {
    await target.click()
    await expect(editor).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 30_000 })
  return editor
}

/** Closes the editor through "Done", which also keeps the note. */
export async function closeEditor(page: Page): Promise<void> {
  const editor = markEditor(page)
  await editor.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(editor).toBeHidden()
}

/** This visit's marks, as the legend lists them: "Mark 1: Dent on the Left front door". */
export function ownMarks(map: Locator): Locator {
  return map.getByRole('region', { name: 'Marks' }).getByRole('button', { name: /^Mark \d+:/ })
}

/** The marks from other visits, drawn grey. */
export function earlierSection(map: Locator): Locator {
  return map.getByRole('region', { name: 'Recorded on an earlier visit' })
}

/** A PDF the page's own session may fetch, read as text. */
export async function pdfAt(page: Page, path: string): Promise<PdfContent> {
  const response = await page.request.get(path)
  expect(response.status(), `${path} answers`).toBe(200)
  return pdfContent(await response.body())
}

export const workOrderPdf = (page: Page, jobId: string) =>
  pdfAt(page, `/api/protected/services/${jobId}/work-order-pdf`)
export const invoicePdf = (page: Page, jobId: string) =>
  pdfAt(page, `/api/protected/services/${jobId}/pdf`)
export const certificatePdf = (page: Page, inspectionId: string) =>
  pdfAt(page, `/api/protected/inspections/${inspectionId}/pdf`)

/** Whether a printed document carries the condition map section at all. */
export function printsMap(pdf: PdfContent): boolean {
  return /VEHICLE CONDITION/i.test(pdf.flat)
}
