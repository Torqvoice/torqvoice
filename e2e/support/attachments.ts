import { expect, type Page } from '@playwright/test'

/**
 * Putting a file on a work order, through the tab that takes it.
 *
 * Shared because two specs need it for different reasons: one asks what an
 * attachment does to the printed invoice, the other needs a file that
 * genuinely belongs to one workshop before it can check another cannot fetch
 * it. Neither may depend on the other having run.
 */
export async function attach(
  page: Page,
  tab: 'Images' | 'Documents',
  file: { name: string; mimeType: string; buffer: Buffer }
): Promise<void> {
  // The tab counts what it holds — "Documents (1)" once there is one — so it
  // is found by what it starts with rather than by its whole name.
  await expect(async () => {
    await page.getByRole('button', { name: new RegExp(`^${tab}`) }).click()
    await expect(page.locator('input[type="file"]').first()).toBeAttached({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  const accept = tab === 'Images' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.csv,.txt'
  await page.locator(`input[type="file"][accept="${accept}"]`).setInputFiles(file)

  // A document is listed by name; a photograph is a thumbnail that carries
  // its name only as the alt text.
  const arrived =
    tab === 'Images'
      ? page.getByRole('img', { name: file.name })
      : page.getByText(file.name).first()
  await expect(arrived, `${file.name} reached the job`).toBeVisible({ timeout: 30_000 })
}
