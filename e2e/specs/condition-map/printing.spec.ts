import { expect, test } from '@playwright/test'
import {
  addMark,
  closeEditor,
  invoicePdf,
  openDropoff,
  printsMap,
  workOrderPdf,
} from '../../support/condition-map'
import {
  conditionMapOnInvoice,
  ownerOrganizationId,
  plantConditionInspection,
  plantConditionJob,
  plantConditionMark,
  plantJobOnVehicle,
  userIdFor,
} from '../../support/db'
import { shareLink } from '../../support/work-order'

/**
 * Where the condition map prints, and what it prints there.
 *
 * - The work order prints the job's own marks, earlier ones grey beside them,
 *   and nothing at all when the job recorded none of its own.
 * - The invoice prints this visit only (the drop-off and the linked
 *   inspection), is off unless the design or the job's own switch turns it on,
 *   and once sent it is the copy the customer holds: a later change on the job
 *   reaches it only when it is sent again.
 *
 * Read from the PDFs themselves, as text. Panel names are the app's English
 * ("Bonnet" for the hood).
 */

const stamp = Date.now()
const DAY = 24 * 60 * 60 * 1000
let organizationId = ''
let userId = ''

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  userId = await userIdFor('demo@torqvoice.com')
})

const jobUrl = (job: { vehicleId: string; serviceRecordId: string }) =>
  `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`

/** A car with a dent on the bonnet from a visit a month ago, and today's job on it. */
async function carWithHistory(label: string) {
  const earlier = await plantConditionJob(
    organizationId,
    userId,
    `${label} earlier`,
    new Date(Date.now() - 30 * DAY)
  )
  await plantConditionMark(
    organizationId,
    earlier.vehicleId,
    { serviceRecordId: earlier.serviceRecordId },
    { view: 'top', panel: 'hood', recordedAt: new Date(Date.now() - 30 * DAY) }
  )
  const today = await plantJobOnVehicle(organizationId, earlier.vehicleId, label)
  return today
}

test.describe('the work order', () => {
  test('prints the job’s own marks, with earlier ones marked as such', async ({ page }) => {
    const job = await carWithHistory(`E2E WO print ${stamp}`)
    await plantConditionMark(
      organizationId,
      job.vehicleId,
      { serviceRecordId: job.serviceRecordId },
      { view: 'left', panel: 'left_front_door', kind: 'scratch', note: 'Keyed along the door' }
    )

    const pdf = await workOrderPdf(page, job.serviceRecordId)
    expect(printsMap(pdf), 'the section is there').toBe(true)
    expect(pdf.flat).toContain('Left front door')
    expect(pdf.flat).toContain('Keyed along the door')
    expect(pdf.flat).toContain('Bonnet (recorded earlier)')
  })

  test('prints nothing when the job recorded no mark of its own', async ({ page }) => {
    const job = await carWithHistory(`E2E WO bare ${stamp}`)
    const pdf = await workOrderPdf(page, job.serviceRecordId)
    expect(printsMap(pdf)).toBe(false)
    expect(pdf.flat).not.toContain('Bonnet')
  })

  test('prints no mark from a later visit on an older job', async ({ page }) => {
    const older = await plantConditionJob(
      organizationId,
      userId,
      `E2E WO older ${stamp}`,
      new Date(Date.now() - 60 * DAY)
    )
    await plantConditionMark(
      organizationId,
      older.vehicleId,
      { serviceRecordId: older.serviceRecordId },
      { view: 'left', panel: 'left_front_door', recordedAt: new Date(Date.now() - 60 * DAY) }
    )
    const later = await plantJobOnVehicle(organizationId, older.vehicleId, `E2E WO later ${stamp}`)
    await plantConditionMark(
      organizationId,
      older.vehicleId,
      { serviceRecordId: later.serviceRecordId },
      { view: 'rear', panel: 'rear_bumper' }
    )

    const pdf = await workOrderPdf(page, older.serviceRecordId)
    expect(printsMap(pdf)).toBe(true)
    expect(pdf.flat).toContain('Left front door')
    expect(pdf.flat, 'a dent found later was not there when this job was done').not.toContain(
      'Rear bumper'
    )
  })
})

test.describe('the invoice', () => {
  test('leaves the map off until the job’s switch puts it on, and then prints this visit only', async ({
    page,
  }) => {
    const job = await carWithHistory(`E2E invoice map ${stamp}`)
    await plantConditionMark(
      organizationId,
      job.vehicleId,
      { serviceRecordId: job.serviceRecordId },
      { view: 'left', panel: 'left_front_door' }
    )
    // The linked inspection's marks are this visit too.
    const inspection = await plantConditionInspection(
      organizationId,
      job.vehicleId,
      `E2E ${stamp}`,
      {
        serviceRecordId: job.serviceRecordId,
      }
    )
    await plantConditionMark(organizationId, job.vehicleId, inspection, {
      view: 'top',
      panel: 'roof',
    })

    expect(printsMap(await invoicePdf(page, job.serviceRecordId)), 'off by default').toBe(false)

    await openDropoff(page, jobUrl(job))
    const onInvoice = page.getByTestId('condition-map-on-invoice')
    await expect(onInvoice).not.toBeChecked()
    await expect(async () => {
      await onInvoice.click()
      await expect(onInvoice).toBeChecked({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect.poll(() => conditionMapOnInvoice(job.serviceRecordId)).toBe(true)

    const pdf = await invoicePdf(page, job.serviceRecordId)
    expect(printsMap(pdf)).toBe(true)
    expect(pdf.flat).toContain('Left front door')
    expect(pdf.flat, 'the linked inspection’s mark').toContain('Roof')
    expect(pdf.flat, 'an earlier visit is not billed here').not.toContain('Bonnet')
    expect(pdf.flat).not.toContain('recorded earlier')
  })

  test('once sent, keeps the map it was sent with until it is sent again', async ({ page }) => {
    const job = await plantConditionJob(organizationId, userId, `E2E sent map ${stamp}`)
    await plantConditionMark(
      organizationId,
      job.vehicleId,
      { serviceRecordId: job.serviceRecordId },
      { view: 'left', panel: 'left_front_door' }
    )

    await openDropoff(page, jobUrl(job))
    const onInvoice = page.getByTestId('condition-map-on-invoice')
    await expect(async () => {
      await onInvoice.click()
      await expect(onInvoice).toBeChecked({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect.poll(() => conditionMapOnInvoice(job.serviceRecordId)).toBe(true)

    // Sent: the share link issues the invoice.
    await shareLink(page)
    await page.keyboard.press('Escape')

    // A dent found after it went out is the job's, not the sent invoice's.
    const again = await openDropoff(page, jobUrl(job))
    await addMark(page, again, 'top', 'trunk')
    await closeEditor(page)
    const sent = await invoicePdf(page, job.serviceRecordId)
    expect(printsMap(sent)).toBe(true)
    expect(sent.flat).toContain('Left front door')
    expect(sent.flat, 'added after it was sent').not.toContain('Boot lid')

    // The switch stays usable, and says where its change will land.
    await expect(onInvoice).toBeEnabled()
    await expect(page.getByTestId('sent-copy-note')).toContainText(
      'Changes here go on the invoice when it is sent again'
    )
  })
})
