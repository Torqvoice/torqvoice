import { expect, type FrameLocator, type Page } from '@playwright/test'
import { settle } from './hydration'

/**
 * Driving the email designer.
 *
 * The designer opens in its own tab from the gallery, on a route that takes
 * either a preset (`&preset=1`) or a saved template (`&template=<id>`), so a
 * spec can go straight to the one it means. The preview is an iframe rendered
 * from `srcDoc`: the mail as a mail client would see it, with a `data-block`
 * mark on every row so the rail and the preview can point at each other.
 */

/** Opens the designer on a kind's built-in preset. */
export async function openPreset(page: Page, kind: string): Promise<void> {
  await page.goto(`/email-designer?kind=${kind}&preset=1`)
  await expect(page.locator('[data-rail-block]').first()).toBeVisible({ timeout: 30_000 })
  await settle(page)
}

/** The mail itself, inside the preview frame. */
export function preview(page: Page): FrameLocator {
  return page.frameLocator('iframe')
}

/**
 * The subject and theme fields.
 *
 * The inspector shows one thing at a time: a block's own fields when a block
 * is selected, and the subject with the theme when none is. The rail's first
 * button is the way back to the whole mail.
 */
export async function openSubjectAndTheme(page: Page): Promise<void> {
  await expect(async () => {
    await page.getByRole('button', { name: 'Subject and theme' }).click()
    await expect(subjectField(page)).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

/** The subject line. Its id carries the tag-field prefix; the label does not. */
export function subjectField(page: Page) {
  return page.getByLabel('Subject', { exact: true })
}

/** The rail row for a block. */
export function railBlock(page: Page, id: string) {
  return page.locator(`[data-rail-block="${id}"]`)
}

/** The ids of the blocks the mail is made of, in the order the rail lists them. */
export async function railOrder(page: Page): Promise<string[]> {
  return page
    .locator('[data-rail-block]')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-rail-block') ?? ''))
}

/**
 * Saves the design, naming it when the designer asks.
 *
 * A preset has no name yet, so the first save opens a dialog; a saved
 * template updates in place. The dialog stays open on a refusal, which is
 * what the duplicate-name test reads.
 */
export async function saveDesign(page: Page, name?: string): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  if (name !== undefined) {
    const dialog = page.getByRole('dialog', { name: 'Save this template' })
    await expect(dialog).toBeVisible({ timeout: 10_000 })
    await dialog.getByPlaceholder('Template name').fill(name)
    await dialog.getByRole('button', { name: 'Save template', exact: true }).click()
  }
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Saved' }).first()
  ).toBeVisible({ timeout: 30_000 })
}
