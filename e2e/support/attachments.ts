import { expect, type Page } from '@playwright/test'

/**
 * Putting a file on a work order, through the files card's tab that takes it.
 *
 * Shared because two specs need it for different reasons: one asks what an
 * attachment does to the printed invoice, the other needs a file that
 * genuinely belongs to one workshop before it can check another cannot fetch
 * it. Neither may depend on the other having run.
 */
export async function attach(
  page: Page,
  tab: 'Photos' | 'Documents',
  file: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
  // The tab counts what it holds, "Documents 1" once there is one, so it is
  // found by what it starts with rather than by its whole name. The first
  // click can land before hydration, so it is repeated until the tab turns.
  const files = page.getByTestId('files-media')
  const trigger = files.getByRole('tab', { name: new RegExp(`^${tab}`) })
  await expect(async () => {
    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  await files.locator('input[type="file"]').setInputFiles(file)

  // Each file lands as a tile named for it. A photo is re-encoded in the
  // browser on the way up and may come back with another extension.
  const stem = file.name.replace(/\.[^.]+$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  await expect(
    files
      .getByTestId('media-tile')
      .filter({ has: page.getByLabel(new RegExp(stem)) })
      .first(),
    `${file.name} reached the job`
  ).toBeVisible({ timeout: 30_000 })
}
