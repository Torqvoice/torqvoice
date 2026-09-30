import { expect, type Page, test } from '@playwright/test'
import {
  deleteMessagesWithBody,
  deleteNotifications,
  jobWithCustomer,
  linkTelegramChat,
  ownerOrganizationId,
  type PlantedNotification,
  plantInboundMessage,
  plantNotification,
} from '../../support/db'
import { settle } from '../../support/hydration'

/**
 * Every notification lands on the thing it is about.
 *
 * An audit of the bell (15 Sep 2026) found links that opened the right page
 * and showed nothing: an inbound SMS, Telegram or WhatsApp message opened the
 * inbox with no conversation selected, a customer's payment opened the
 * vehicle instead of the invoice, and feedback on a status report did not
 * switch tab when the job was already open.
 *
 * The notifications are planted with the address the code builds, and in the
 * old shape where the pages now have to honour links already stored in
 * people's bells. The triggers themselves (a Twilio webhook, a Telegram
 * update) need providers the harness cannot play.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const planted: string[] = []
const bodies: string[] = []
let organizationId = ''
let job: Awaited<ReturnType<typeof jobWithCustomer>>
/** The customer's Telegram chat before the spec linked one, put back afterwards. */
let previousTelegramChat: string | null | undefined

test.beforeAll(async () => {
  organizationId = await ownerOrganizationId()
  job = await jobWithCustomer(organizationId)
})

test.afterAll(async () => {
  await deleteNotifications(planted)
  if (previousTelegramChat !== undefined) {
    await linkTelegramChat(job.customerId, previousTelegramChat)
  }
  for (const body of bodies) await deleteMessagesWithBody(body)
})

async function plant(notification: PlantedNotification): Promise<void> {
  planted.push(await plantNotification(organizationId, notification))
}

/** Opens the bell and clicks the notification with this title. */
async function openFromBell(page: Page, title: string): Promise<void> {
  const panel = page.getByRole('dialog', { name: 'Notifications' })
  await expect(async () => {
    await page.getByRole('button', { name: 'Open notifications' }).click()
    await expect(panel).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await panel.getByRole('button').filter({ hasText: title }).first().click()
  await expect(panel).toBeHidden()
}

test('an inbound SMS opens that conversation, not an empty inbox', async ({ page }) => {
  const body = `E2E SMS from the customer ${stamp}`
  const title = `E2E new SMS ${stamp}`
  bodies.push(body)
  await plantInboundMessage('sms', organizationId, job.customerId, body)
  await plant({
    type: 'sms_inbound',
    title,
    message: `${job.customerName}: ${body}`,
    entityType: 'sms_message',
    entityId: job.customerId,
    entityUrl: `/messages?customerId=${job.customerId}`,
  })

  await page.goto('/')
  await settle(page)
  await openFromBell(page, title)

  await page.waitForURL(/\/messages\?customerId=/)
  await expect(page.getByText('Pick a conversation')).toHaveCount(0)
  // Once in the list's preview and once in the open conversation.
  await expect(page.getByText(body).filter({ visible: true })).toHaveCount(2)
})

test('a Telegram message stored with the old link opens its conversation', async ({ page }) => {
  const body = `E2E Telegram from the customer ${stamp}`
  const title = `E2E new Telegram ${stamp}`
  bodies.push(body)
  previousTelegramChat = await linkTelegramChat(job.customerId, '777000')
  await plantInboundMessage('telegram', organizationId, job.customerId, body)
  await plant({
    type: 'telegram_inbound',
    title,
    message: `${job.customerName}: ${body}`,
    entityType: 'telegram_message',
    entityId: job.customerId,
    entityUrl: `/messages?tab=telegram&customerId=${job.customerId}`,
  })

  await page.goto('/')
  await settle(page)
  await openFromBell(page, title)

  await page.waitForURL(/\/messages\?tab=telegram/)
  await expect(page.getByText('Pick a conversation')).toHaveCount(0)
  await expect(page.getByText(body).filter({ visible: true })).toHaveCount(2)
})

test('a payment stored with the old vehicle link opens the invoice', async ({ page }) => {
  const title = `E2E payment received ${stamp}`
  await plant({
    type: 'invoice_payment',
    title,
    message: `${job.customerName} paid 100.00`,
    entityType: 'invoice',
    entityId: job.serviceRecordId,
    entityUrl: `/vehicles/${job.vehicleId}?tab=service&record=${job.serviceRecordId}`,
  })

  await page.goto('/')
  await settle(page)
  await openFromBell(page, title)

  await page.waitForURL(`**/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`)
})

test('feedback on a status report switches the open job to its reports', async ({ page }) => {
  const title = `E2E status report feedback ${stamp}`
  await plant({
    type: 'status_report_feedback',
    title,
    message: `${job.customerName} responded to the status report`,
    entityType: 'ServiceRecord',
    entityId: job.serviceRecordId,
    entityUrl: `/vehicles/${job.vehicleId}/service/${job.serviceRecordId}?tab=statusReports`,
  })

  // The job is already open on its details when the notification is clicked.
  await page.goto(`/vehicles/${job.vehicleId}/service/${job.serviceRecordId}`)
  await settle(page)
  await expect(page.getByRole('button', { name: 'New Status Report' })).toHaveCount(0)
  await openFromBell(page, title)

  await page.waitForURL(/tab=statusReports/)
  await expect(page.getByRole('button', { name: 'New Status Report' })).toBeVisible()
})
