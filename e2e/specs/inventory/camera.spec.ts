import { expect, test } from '@playwright/test'
import { settle } from '../../support/hydration'

/**
 * Photographing a part at the desk. A phone's "Camera" opens its camera app
 * from a file input; a desk browser ignores that and shows the file picker
 * (issue #555), so the page takes the photo itself with the computer's camera
 * or a plugged-in webcam, and the photo joins the part's gallery exactly as an
 * uploaded file would.
 *
 * Chromium is handed a fake camera and the permission is granted up front, so
 * the camera runs as it would for a person who said yes.
 */

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera'],
})

test('Camera on a desk computer takes the part photo with the webcam, not the file picker', async ({
  page,
}) => {
  await page.goto('/inventory')
  await settle(page)

  await expect(async () => {
    // The toolbar's button; the empty list has a second one.
    await page.getByRole('button', { name: 'Add Part' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Add New Part' })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  const form = page.getByRole('dialog', { name: 'Add New Part' })

  // No file picker: the page's own camera.
  let picked = false
  page.on('filechooser', () => {
    picked = true
  })
  await form.getByRole('button', { name: 'Camera', exact: true }).click()
  const camera = page.getByTestId('camera-photo')
  await expect(camera).toBeVisible()
  expect(picked, 'a desk computer is not sent to the file picker').toBe(false)

  const take = camera.getByRole('button', { name: 'Take photo' })
  await expect(take).toBeEnabled({ timeout: 15_000 })
  await take.click()

  // Looked at before it is used.
  await expect(camera.getByRole('img', { name: 'The photo you just took' })).toBeVisible()
  await camera.getByRole('button', { name: 'Use this photo' }).click()
  await expect(camera).toBeHidden()
  await expect(page.getByText('Image uploaded')).toBeVisible({ timeout: 30_000 })
  await expect(form.getByRole('img', { name: 'Part 1' })).toBeVisible()
})
