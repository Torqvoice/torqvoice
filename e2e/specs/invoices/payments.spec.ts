import { expect, type Locator, type Page, test } from '@playwright/test'
import { setTax } from '../../support/settings'
import {
  addLabor,
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
} from '../../support/work-order'

/**
 * Money coming in against an invoice: part of it, the rest of it, a payment
 * taken back, and the workshop simply declaring the job paid.
 *
 * The arithmetic is worth pinning because three places have to agree on it —
 * the badge on the payments panel, the running total beside it, and the
 * balance due on the invoice summary the customer's copy is built from. A job
 * of exactly 900 with tax off keeps the sums readable; the tax settings are
 * put back at the end.
 *
 * Serial: one job, paid down step by step, and each step needs the one before.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()

/** The payments box on the work order, and not the badge in the page header. */
function paymentsPanel(page: Page): Locator {
  return page
    .getByRole('heading', { name: 'Payments', exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
}

/** The figure beside a label, in whichever panel the label belongs to. */
function labelledRow(panel: Locator, label: string): Locator {
  return panel
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
}

/** One line of the Invoice Summary panel: what the customer's copy will say. */
function summaryRow(page: Page, label: string): Locator {
  const panel = page
    .getByRole('heading', { name: 'Invoice Summary', exact: true })
    .locator('xpath=ancestor::div[1]')
  return labelledRow(panel, label)
}

/** What the panel calls the payment state: Unpaid, Partial or Paid. */
function paymentBadge(page: Page, state: 'Unpaid' | 'Partial' | 'Paid'): Locator {
  return paymentsPanel(page).getByText(state, { exact: true })
}

/**
 * The customer is offered a message every time money is recorded. There is no
 * SMS or mail provider in the test environment, and sending is a subject of
 * its own, so the offer is declined.
 */
async function declineNotification(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').filter({ hasText: /^Notify / })
  const offered = await dialog
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (offered) await dialog.getByRole('button', { name: 'Skip', exact: true }).click()
  await expect(dialog).toBeHidden()
}

type Method = 'Cash' | 'Card' | 'Transfer' | 'Other'

/** Records one payment through the panel's own form. */
async function recordPayment(page: Page, amount: number, method: Method): Promise<void> {
  const panel = paymentsPanel(page)
  const amountField = page.locator('#paymentAmount')
  // The form opens on a click that does nothing before React has taken the
  // page over, and says nothing when it is lost.
  await expect(async () => {
    await panel.getByRole('button', { name: 'Record Payment', exact: true }).click()
    await expect(amountField).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })

  // The field offers the whole balance; each of these tests pays its own figure.
  await amountField.fill(String(amount))
  // The only select in the panel is the method.
  await panel.getByRole('combobox').click()
  await page.getByRole('option', { name: method, exact: true }).click()

  await panel.getByRole('button', { name: 'Save Payment', exact: true }).click()
  await expect(page.getByText('Payment recorded', { exact: true })).toBeVisible()
  await declineNotification(page)
}

let jobUrl = ''

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await setTax(page, { enabled: false })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E payments ${stamp}`)
  // 2 × 300 in parts and two hours at 150: nine hundred, and no tax on top.
  await addPart(page, { name: `E2E clutch kit ${stamp}`, quantity: 2, unitPrice: 300 })
  await addLabor(page, { description: 'Replace clutch', hours: 2, rate: 150 })
  await saveWorkOrder(page)
  await page.close()
})

test.describe('paying an invoice', () => {
  test('a job nobody has paid says so', async ({ page }) => {
    await page.goto(jobUrl)

    await expect(paymentBadge(page, 'Unpaid')).toBeVisible()
    await expect(labelledRow(paymentsPanel(page), 'Total Paid')).toContainText('$0.00 / $900.00')
    // Nothing is owed until something is paid, so the summary shows no balance.
    await expect(summaryRow(page, 'Total')).toContainText('$900.00')
    await expect(summaryRow(page, 'Balance Due')).toHaveCount(0)
  })

  test('part of the money leaves a balance', async ({ page }) => {
    await page.goto(jobUrl)
    await recordPayment(page, 400, 'Cash')

    await expect(paymentBadge(page, 'Partial')).toBeVisible()
    await expect(labelledRow(paymentsPanel(page), 'Total Paid')).toContainText('$400.00 / $900.00')

    // The payment itself is listed, with the method it came in by.
    const row = paymentsPanel(page).getByRole('row').filter({ hasText: '$400.00' })
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('cash')

    await expect(summaryRow(page, 'Paid')).toContainText('-$400.00')
    await expect(summaryRow(page, 'Balance Due')).toContainText('$500.00')
  })

  test('the rest of it settles the invoice', async ({ page }) => {
    await page.goto(jobUrl)
    await recordPayment(page, 500, 'Card')

    await expect(paymentBadge(page, 'Paid')).toBeVisible()
    await expect(labelledRow(paymentsPanel(page), 'Total Paid')).toContainText('$900.00 / $900.00')
    // Settled, the balance line stops being a figure and says so.
    await expect(summaryRow(page, 'Balance Due')).toContainText('PAID')

    // Money against a job makes the invoice the customer's document, whether
    // or not it was ever sent, so it carries a number from here on.
    await expect(page.getByLabel('Invoice Number')).not.toHaveValue('')
  })

  test('taking a payment back reopens the balance', async ({ page }) => {
    await page.goto(jobUrl)

    const row = paymentsPanel(page).getByRole('row').filter({ hasText: '$500.00' })
    const confirm = page.getByRole('alertdialog', { name: 'Delete Payment' })
    // A click before the page is interactive opens nothing and says nothing.
    await expect(async () => {
      await row.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(confirm).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Payment deleted', { exact: true })).toBeVisible()

    await expect(paymentBadge(page, 'Partial')).toBeVisible()
    await expect(summaryRow(page, 'Balance Due')).toContainText('$500.00')
  })

  test('the workshop can declare it paid without a payment', async ({ page }) => {
    await page.goto(jobUrl)
    const panel = paymentsPanel(page)

    await expect(async () => {
      await panel.getByRole('button', { name: 'Mark as Paid', exact: true }).click()
      await expect(page.getByText('Marked as paid', { exact: true })).toBeVisible({
        timeout: 2_000,
      })
    }).toPass({ timeout: 30_000 })
    await declineNotification(page)

    // Declared paid covers the balance; the payment that was actually taken is
    // still the only row in the table.
    await expect(paymentBadge(page, 'Paid')).toBeVisible()
    await expect(labelledRow(panel, 'Total Paid')).toContainText('$900.00 / $900.00')
    await expect(panel.getByRole('row').filter({ hasText: '$400.00' })).toHaveCount(1)

    await panel.getByRole('button', { name: 'Mark as Unpaid', exact: true }).click()
    await expect(page.getByText('Marked as unpaid', { exact: true })).toBeVisible()

    // Back to what was really paid, rather than to nothing.
    await expect(paymentBadge(page, 'Partial')).toBeVisible()
    await expect(labelledRow(panel, 'Total Paid')).toContainText('$400.00 / $900.00')
  })

  test('the tax settings are put back', async ({ page }) => {
    await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })
  })
})
