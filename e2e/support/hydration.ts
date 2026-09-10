import { expect, type Locator, type Page } from '@playwright/test'

/**
 * A page can be on screen before React has taken it over. Typed into then,
 * a controlled field keeps the letters on screen while React's own state
 * stays empty, and the button beside it sends nothing. There is no reliable
 * signal for the moment that passes.
 */

/** Gives a freshly opened page time to become interactive. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1_000)
}

/**
 * Types into a field once the page has settled, and checks the words are
 * still there afterwards, repeating if they were lost to a late render.
 */
export async function fillSettled(field: Locator, value: string): Promise<void> {
  await settle(field.page())
  await expect(async () => {
    await field.fill(value)
    await field.page().waitForTimeout(400)
    await expect(field).toHaveValue(value)
  }).toPass({ timeout: 30_000 })
}
