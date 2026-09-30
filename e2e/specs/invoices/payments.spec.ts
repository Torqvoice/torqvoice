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

/** The invoice card's payments: what came in, the balance, and the form. */
function paymentsPanel(page: Page): Locator {
  return page.getByTestId('payments-section')
}

/** What the invoice card calls the payment state: Unpaid, Partial or Paid. */
function paymentBadge(page: Page, state: 'Unpaid' | 'Partial' | 'Paid'): Locator {
  return page.getByTestId('payment-status').filter({ hasText: new RegExp(`^${state}$`) })
}

/** The money bar along the bottom: the total, what is paid, and the balance. */
function moneyBar(page: Page, figure: 'total' | 'paid' | 'balance'): Locator {
  return page.getByTestId('money-bar').getByTestId(`money-${figure}`)
}

/** One payment in the list, found by its amount. */
function paymentRow(page: Page, amount: string): Locator {
  return paymentsPanel(page).getByRole('listitem').filter({ hasText: amount })
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
    await expect(moneyBar(page, 'total')).toHaveText('$900.00')
    await expect(moneyBar(page, 'paid')).toHaveText('$0.00')
    await expect(moneyBar(page, 'balance')).toHaveText('$900.00')
    await expect(paymentsPanel(page)).toContainText('Nothing paid yet.')
  })

  test('part of the money leaves a balance', async ({ page }) => {
    await page.goto(jobUrl)
    await recordPayment(page, 400, 'Cash')

    await expect(paymentBadge(page, 'Partial')).toBeVisible()
    await expect(moneyBar(page, 'paid')).toHaveText('$400.00')

    // The payment itself is listed, with the method it came in by.
    const row = paymentRow(page, '$400.00')
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('cash')

    await expect(moneyBar(page, 'balance')).toHaveText('$500.00')
    await expect(paymentsPanel(page).getByTestId('balance-due')).toHaveText('$500.00')
  })

  test('the rest of it settles the invoice', async ({ page }) => {
    await page.goto(jobUrl)
    await recordPayment(page, 500, 'Card')

    await expect(paymentBadge(page, 'Paid')).toBeVisible()
    await expect(moneyBar(page, 'paid')).toHaveText('$900.00')
    await expect(paymentsPanel(page).getByTestId('balance-due')).toHaveText('$0.00')

    // Money against a job makes the invoice the customer's document, whether
    // or not it was ever sent, so it carries a number from here on.
    await expect(page.getByLabel('Invoice Number')).not.toHaveValue('')
  })

  test('taking a payment back reopens the balance', async ({ page }) => {
    await page.goto(jobUrl)

    const row = paymentRow(page, '$500.00')
    const confirm = page.getByRole('alertdialog', { name: 'Delete Payment' })
    // A click before the page is interactive opens nothing and says nothing.
    await expect(async () => {
      await row.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(confirm).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByText('Payment deleted', { exact: true })).toBeVisible()

    await expect(paymentBadge(page, 'Partial')).toBeVisible()
    await expect(paymentsPanel(page).getByTestId('balance-due')).toHaveText('$500.00')
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
    await expect(paymentsPanel(page).getByTestId('balance-due')).toHaveText('$0.00')
    await expect(paymentRow(page, '$400.00')).toHaveCount(1)

    await panel.getByRole('button', { name: 'Mark as Unpaid', exact: true }).click()
    await expect(page.getByText('Marked as unpaid', { exact: true })).toBeVisible()

    // Back to what was really paid, rather than to nothing.
    await expect(paymentBadge(page, 'Partial')).toBeVisible()
    await expect(paymentsPanel(page).getByTestId('balance-due')).toHaveText('$500.00')
  })

  test('the tax settings are put back', async ({ page }) => {
    await setTax(page, { enabled: true, rate: 25, inclusive: false, label: '' })
  })
})
