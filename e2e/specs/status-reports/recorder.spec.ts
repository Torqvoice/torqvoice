import { expect, test } from '@playwright/test'
import { addMark, openDropoff } from '../../support/condition-map'
import { ownerOrganizationId, plantConditionJob, userIdFor } from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * Recording a video at the desk. A phone's "Record" opens its camera app; a
 * desk computer has none to open, so the page records itself, and the take is
 * used exactly as an uploaded file would be.
 *
 * Chromium is handed a fake camera and microphone, and the permission is
 * granted up front, so the recorder runs as it would for a person who said yes.
 */

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera', 'microphone'],
})

const stamp = Date.now()

test('Record on a desk computer opens the recorder, and the take becomes the report’s video', async ({
  page,
}) => {
  const organizationId = await ownerOrganizationId()
  const userId = await userIdFor('demo@torqvoice.com')
  const job = await plantConditionJob(organizationId, userId, `E2E recorder ${stamp}`)
  await page.goto(`/vehicles/${job.vehicleId}/service/${job.serviceRecordId}?tab=statusReports`)
  await settle(page)

  await expect(async () => {
    await page.getByRole('button', { name: 'New Status Report' }).first().click()
    await expect(page.getByRole('dialog', { name: 'Status Report' })).toBeVisible({
      timeout: 2_000,
    })
  }).toPass({ timeout: 30_000 })
  const report = page.getByRole('dialog', { name: 'Status Report' })

  // No file picker: the page's own recorder.
  let picked = false
  page.on('filechooser', () => {
    picked = true
  })
  await report.getByRole('button', { name: 'Record', exact: true }).click()
  const recorder = page.getByTestId('video-recorder')
  await expect(recorder).toBeVisible()
  expect(picked, 'a desk computer is not sent to the file picker').toBe(false)

  const start = recorder.getByRole('button', { name: 'Start recording' })
  await expect(start).toBeEnabled({ timeout: 15_000 })
  await start.click()
  await expect(recorder).toContainText('Recording 0:02', { timeout: 10_000 })
  await recorder.getByRole('button', { name: 'Stop' }).click()

  // Watched back before it is used.
  await expect(recorder.locator('video[controls]')).toBeVisible()
  await recorder.getByRole('button', { name: 'Use this video' }).click()
  await expect(recorder).toBeHidden()
  await expect(report).toContainText(/recording-\d+\.webm/, { timeout: 30_000 })

  await report.getByLabel('Title').fill(`E2E recorded ${stamp}`)
  await report.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page.getByText('Status report created')).toBeVisible()
})

test('Take photo is not offered on a desk computer, where it would only open the file picker', async ({
  page,
}) => {
  const organizationId = await ownerOrganizationId()
  const userId = await userIdFor('demo@torqvoice.com')
  const job = await plantConditionJob(organizationId, userId, `E2E take photo ${stamp}`)
  const map = await openDropoff(page, `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`)
  const editor = await addMark(page, map, 'left', 'left_front_door')
  await expect(editor.getByRole('button', { name: 'Add photo' })).toBeVisible()
  await expect(editor.getByRole('button', { name: 'Take photo' })).toHaveCount(0)
})
