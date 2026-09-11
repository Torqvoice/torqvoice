import { expect, type Page, test } from '@playwright/test'
import Stripe from 'stripe'
import { forgetConnections, ownerOrganizationId, paymentsFor } from '../../support/db'
import { settle } from '../../support/hydration'
import {
  clearPaymentSink,
  connectVendor,
  expectConnection,
  paymentSink,
} from '../../support/payments'
import {
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * A customer pays an invoice online, and the workshop's books follow.
 *
 * The chain this file walks is the one a workshop depends on without ever
 * seeing it: keys typed into Settings → Integrations, a pay button on the
 * shared invoice for exactly what is owed, the customer sent to the vendor
 * and back, and a payment recorded once, against the right invoice, however
 * many times the vendor or the browser reports it. Getting any link wrong
 * either loses money quietly or books money twice.
 *
 * Stripe and PayPal are played by `e2e/payment-sink.ts`, which answers the
 * calls the app makes with the shapes the vendors use and has a checkout page
 * a spec pays on. What it records is how the amount charged is checked against
 * the amount the invoice showed.
 *
 * Pinned on the seeded workshop's 25% exclusive tax in dollars: one part at
 * 800 makes a total of 1,000.00. 400 is paid by card, then 600 through PayPal.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const STRIPE_KEY = `sk_test_e2e_${stamp}`
const WEBHOOK_SECRET = `whsec_e2e_${stamp}`

let jobUrl = ''
let jobId = ''
let invoiceUrl = ''
let organizationId = ''

/** The shared invoice, hydrated, as the customer opens it. */
async function openInvoice(page: Page, url = invoiceUrl): Promise<void> {
  await page.goto(url)
  await settle(page)
}

/** The badge the work order's payments panel shows: Unpaid, Partial or Paid. */
async function expectWorkOrderPaymentState(
  page: Page,
  state: 'Unpaid' | 'Partial' | 'Paid'
): Promise<void> {
  await page.goto(jobUrl)
  await settle(page)
  const panel = page
    .getByRole('heading', { name: 'Payments', exact: true })
    .locator('xpath=ancestor::div[contains(@class,"rounded-lg")][1]')
  await expect(
    panel.getByText(state, { exact: true }),
    `the work order reads ${state}`
  ).toBeVisible()
}

/** Starts a payment of `amount` with a vendor, and lands on its checkout page. */
async function startPayment(page: Page, vendor: 'Card' | 'PayPal', amount: string): Promise<void> {
  await openInvoice(page)
  await expect(async () => {
    await page.getByRole('button', { name: 'Partial payment', exact: true }).click()
    await expect(page.locator('#payAmount')).toBeVisible({ timeout: 2_000 })
  }).toPass({ timeout: 30_000 })
  await page.locator('#payAmount').fill(amount)
  await page.getByRole('button', { name: new RegExp(`with ${vendor}$`) }).click()
  await expect(page.getByRole('heading', { name: /checkout/ })).toBeVisible({ timeout: 30_000 })
}

/** A Stripe notification, signed with the workshop's webhook secret unless told otherwise. */
function stripeNotification(session: unknown, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}`,
    object: 'event',
    type: 'checkout.session.completed',
    data: { object: session },
  })
  const signature = new Stripe('sk_test_unused').webhooks.generateTestHeaderString({
    payload,
    secret,
  })
  return { payload, signature }
}

test.beforeAll(async ({ browser }) => {
  await clearPaymentSink()
  // A spec that failed halfway must not leave a connection behind, and this
  // one must start from none.
  await forgetConnections(['stripe', 'paypal'])
  organizationId = await ownerOrganizationId()

  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  const vehicleUrl = await seededVehicleUrl(page)
  jobUrl = await newWorkOrder(page, vehicleUrl, `E2E paid online ${stamp}`)
  jobId = jobUrl.split('/').pop() ?? ''
  await addPart(page, { name: `E2E alternator ${stamp}`, quantity: 1, unitPrice: 800 })
  await saveWorkOrder(page)
  await page.close()
})

test.afterAll(async () => {
  // Every other spec shares invoices, and a connected vendor would put a pay
  // button on all of them.
  await forgetConnections(['stripe', 'paypal'])
})

test.describe('connecting a vendor', () => {
  test('refuses a Stripe key that Stripe does not accept', async ({ page }) => {
    await connectVendor(page, 'stripe', { secretKey: 'sk_test_wrong' })

    // Checked against the vendor before anything is stored as live, and the
    // workshop is told why, where they typed it.
    await expect(page.getByText('Stripe rejected the secret key')).toBeVisible({ timeout: 30_000 })
    await expectConnection('stripe', 'error')
  })

  test('connects Stripe with a key it does accept', async ({ page }) => {
    await connectVendor(page, 'stripe', { secretKey: STRIPE_KEY, webhookSecret: WEBHOOK_SECRET })
    await expectConnection('stripe', 'active')

    // And shows where Stripe must send its notifications, which is the step a
    // workshop most often misses.
    await page.goto('/settings/integrations/stripe')
    await settle(page)
    await expect(page.getByText('Inbound webhook URL')).toBeVisible()
    await expect(page.getByText(/\/api\/webhooks\/stripe/).first()).toBeVisible()
  })

  test('refuses a PayPal secret that PayPal does not accept', async ({ page }) => {
    await connectVendor(page, 'paypal', { clientId: 'e2e-client', clientSecret: 'wrong-secret' })
    await expect(page.getByText(/PayPal auth failed/)).toBeVisible({ timeout: 30_000 })
    await expectConnection('paypal', 'error')
  })

  test('connects PayPal with an id and secret it does accept', async ({ page }) => {
    await connectVendor(page, 'paypal', {
      clientId: `e2e-client-${stamp}`,
      clientSecret: `e2e-secret-${stamp}`,
    })
    await expectConnection('paypal', 'active')
  })
})

test.describe('the invoice a customer is sent', () => {
  test('shows what is owed, and offers both vendors for exactly that', async ({ page }) => {
    await page.goto(jobUrl)
    invoiceUrl = await shareLink(page)

    await openInvoice(page)
    await expect(page.getByText('Balance Due').first()).toBeVisible()
    await expect(page.getByText(/\$1,?000\.00/).first(), 'the total the job came to').toBeVisible()
    await expect(page.getByRole('button', { name: /Pay \$1,?000\.00 with Card/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Pay \$1,?000\.00 with PayPal/ })).toBeVisible()
  })

  test('refuses to charge more than is owed', async ({ request }) => {
    const [org, token] = new URL(invoiceUrl).pathname.split('/').slice(-2)
    const before = (await paymentSink()).stripe.length

    const response = await request.post(`/api/public/share/invoice/${org}/${token}/checkout`, {
      data: { provider: 'stripe', amount: 1000.5 },
    })
    expect(response.status(), 'more than the balance').toBe(400)
    // Refused before the vendor was asked for anything.
    expect((await paymentSink()).stripe.length).toBe(before)
  })
})

test.describe('paying part of it by card', () => {
  test('charges what the customer chose, for this invoice', async ({ page }) => {
    await startPayment(page, 'Card', '400')

    // The vendor was asked for exactly that, in cents, and told whose invoice
    // it is: the metadata is what the notification is matched on later.
    const session = (await paymentSink()).stripe.at(-1)
    expect(session?.amount_total, 'the amount sent to Stripe').toBe(40000)
    expect(session?.currency).toBe('usd')
    expect(session?.metadata.serviceRecordId).toBe(jobId)
    expect(session?.metadata.orgId).toBe(organizationId)
    await expect(page.locator('#amount')).toHaveText('400.00 USD')
  })

  test('is recorded when the customer comes back, and the invoice says what is left', async ({
    page,
  }) => {
    await startPayment(page, 'Card', '400')
    await page.getByRole('button', { name: 'Pay', exact: true }).click()

    // Back on the invoice, which checks with Stripe before believing it.
    await expect(page.getByText('Payment received!')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/\$400\.00 has been applied/)).toBeVisible()

    const recorded = await paymentsFor(jobId)
    expect(recorded.map((p) => [p.provider, p.amount])).toEqual([['stripe', 400]])

    await expectWorkOrderPaymentState(page, 'Partial')

    // The customer's copy owes the rest, and offers it.
    await openInvoice(page)
    await expect(page.getByRole('button', { name: /Pay \$600\.00 with Card/ })).toBeVisible()
  })

  test('is not counted twice when the same payment is reported again', async ({
    page,
    request,
  }) => {
    const paid = (await paymentSink()).stripe.filter((s) => s.payment_status === 'paid')
    const session = paid.at(-1)
    expect(session, 'a paid session from the test before').toBeTruthy()

    // The customer reloads the page Stripe sent them back to.
    await page.goto(`${invoiceUrl}?session_id=${session?.id}`)
    await settle(page)
    await expect(page.getByText(/Payment received!|could not be verified/)).toBeVisible({
      timeout: 30_000,
    })

    // And Stripe's own notification for the same session arrives afterwards,
    // as it always does in real life: two reports of one payment.
    const { payload, signature } = stripeNotification(session)
    const notified = await request.post('/api/webhooks/stripe', {
      data: payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    })
    expect(notified.status()).toBe(200)

    expect(
      (await paymentsFor(jobId)).map((p) => [p.provider, p.amount]),
      'still one payment of 400'
    ).toEqual([['stripe', 400]])
  })

  test('ignores a notification that Stripe did not sign', async ({ request }) => {
    // A forged "this invoice is paid", which is what the signature is for.
    const forged = {
      id: `cs_test_forged_${stamp}`,
      object: 'checkout.session',
      payment_status: 'paid',
      amount_total: 60000,
      metadata: { serviceRecordId: jobId, orgId: organizationId },
    }
    const { payload, signature } = stripeNotification(forged, 'whsec_not_the_workshops')
    const response = await request.post('/api/webhooks/stripe', {
      data: payload,
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
    })
    expect(response.status(), 'the signature does not verify').toBe(400)
    expect((await paymentsFor(jobId)).length, 'nothing recorded').toBe(1)
  })
})

test.describe('a customer who changes their mind at the vendor', () => {
  test('pays nothing, and nothing is recorded', async ({ page }) => {
    await startPayment(page, 'PayPal', '600')
    await page.getByRole('link', { name: 'Cancel' }).click()

    // Back on the invoice with the same balance, and no payment on the books.
    await expect(page).toHaveURL(new RegExp(new URL(invoiceUrl).pathname))
    await settle(page)
    await expect(page.getByRole('button', { name: /Pay \$600\.00 with PayPal/ })).toBeVisible()
    expect((await paymentsFor(jobId)).length).toBe(1)
  })
})

test.describe('paying the rest through PayPal', () => {
  test('settles the invoice', async ({ page }) => {
    await startPayment(page, 'PayPal', '600')
    const order = (await paymentSink()).paypal.at(-1)
    expect(order?.amount, 'the amount sent to PayPal').toEqual({
      currency_code: 'USD',
      value: '600.00',
    })
    expect(order?.custom_id).toBe(`${jobId}:${organizationId}`)

    await page.getByRole('button', { name: 'Pay', exact: true }).click()
    await expect(page.getByText('Payment received!')).toBeVisible({ timeout: 30_000 })

    expect((await paymentsFor(jobId)).map((p) => [p.provider, p.amount])).toEqual([
      ['stripe', 400],
      ['paypal', 600],
    ])
    await expectWorkOrderPaymentState(page, 'Paid')

    // Nothing is owed, so the customer is offered nothing to pay.
    await openInvoice(page)
    await expect(page.getByRole('button', { name: /with Card|with PayPal/ })).toHaveCount(0)
  })

  test('is not counted twice when PayPal reports it too', async ({ request }) => {
    const order = (await paymentSink()).paypal.find((o) => o.status === 'COMPLETED')
    expect(order, 'the order paid in the test before').toBeTruthy()

    const response = await request.post('/api/webhooks/paypal', {
      data: {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: {
          id: `CAP-${order?.id}`,
          custom_id: order?.custom_id,
          supplementary_data: { related_ids: { order_id: order?.id } },
        },
      },
    })
    expect(response.status()).toBe(200)
    expect((await paymentsFor(jobId)).length, 'still two payments').toBe(2)
  })

  test('refuses more money on an invoice that is paid in full', async ({ request }) => {
    const [org, token] = new URL(invoiceUrl).pathname.split('/').slice(-2)
    const response = await request.post(`/api/public/share/invoice/${org}/${token}/checkout`, {
      data: { provider: 'paypal', amount: 1 },
    })
    expect(response.status()).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'Invoice is already paid in full' })
  })
})
