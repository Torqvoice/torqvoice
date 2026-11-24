import { expect, type Page, test } from '@playwright/test'
import { setTax } from '../../support/settings'
import { addLabor, newWorkOrder, saveWorkOrder, seededVehicleUrl } from '../../support/work-order'

/**
 * An invoice that went out is cancelled, not deleted. Most countries want
 * invoice numbers without gaps, so once money is taken against a job (which
 * issues its invoice) the work order's menu no longer offers Delete: it
 * offers Cancel invoice, which keeps the job and its number, says how much
 * was paid, and can book what is handed back as a refund.
 *
 * Serial: one job, paid, then cancelled.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
let jobUrl = ''

async function openMenu(page: Page) {
  await expect(async () => {
    await page.getByRole('button', { name: 'More actions' }).click()
    await expect(page.getByRole('menu')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
}

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setTax(page, { enabled: false })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E cancel invoice ${stamp}`)
  await addLabor(page, { description: 'Replace brake pads', hours: 2, rate: 150 })
  await saveWorkOrder(page)
  await page.close()
})

test('a draft can still be deleted', async ({ page }) => {
  await page.goto(jobUrl)
  await openMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Cancel invoice' })).toHaveCount(0)
  await page.keyboard.press('Escape')
})

test('a paid invoice is cancelled with a refund, and keeps its number', async ({ page }) => {
  await page.goto(jobUrl)
  // Money against the job issues its invoice.
  const panel = page.getByTestId('payments-section')
  await expect(async () => {
    await panel.getByRole('button', { name: 'Record Payment', exact: true }).click()
    await expect(page.locator('#paymentAmount')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('#paymentAmount').fill('300')
  await panel.getByRole('button', { name: 'Save Payment', exact: true }).click()
  await expect(page.getByText('Payment recorded', { exact: true })).toBeVisible()
  const notify = page.getByRole('dialog').filter({ hasText: /^Notify / })
  if (await notify.isVisible().catch(() => false)) {
    await notify.getByRole('button', { name: 'Skip', exact: true }).click()
  }

  const number = await page.getByLabel('Invoice Number').inputValue()
  expect(number).not.toBe('')

  await openMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
  await page.getByRole('menuitem', { name: 'Cancel invoice' }).click()

  const dialog = page.getByTestId('cancel-invoice-dialog')
  await expect(dialog).toContainText(`Cancel invoice ${number}?`)
  await expect(dialog.getByTestId('cancel-invoice-paid')).toContainText('$300.00')
  await dialog.getByLabel('Record a refund of money handed back to the customer').check()
  await expect(dialog.getByLabel('Refund amount')).toHaveValue('300.00')
  await dialog.getByRole('button', { name: 'Cancel invoice', exact: true }).click()

  await expect(page.getByText('Invoice cancelled', { exact: true })).toBeVisible()
  await expect(page.getByTestId('cancelled-invoice-banner')).toContainText(
    `Invoice ${number} is cancelled`
  )
  await expect(page.getByTestId('service-status')).toHaveText('Cancelled')
  // The refund is a payment of its own, taking the money back off.
  await expect(panel).toContainText('-$300.00')

  // Final: the menu offers neither.
  await openMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0)
  await expect(page.getByRole('menuitem', { name: 'Cancel invoice' })).toHaveCount(0)
})
