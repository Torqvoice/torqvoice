import { expect, type Page, test } from '@playwright/test'
import { forgetConnections, ownerOrganizationId, paymentsFor } from '../../support/db'
import { settle } from '../../support/hydration'
import {
  clearPaymentSink,
  connectVendor,
  expectConnection,
  paymentSink,
  type SinkPayPalOrder,
} from '../../support/payments'
import {
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * A payment settles the invoice it was made for, and no other.
 *
 * The return page and the vendor's notification both name an order and an
 * invoice, and the audit found the app checked that the order was paid but
 * never that it was created for that invoice. Paying one unit on your own
 * invoice and posting the order against somebody else's marked theirs as
 * paid, and the idempotency key then blocked the real payment. The vendor's
 * own record of who the order was for is compared now, as Stripe's always
 * was.
 *
 * Two invoices, one payment on the first, and the paid order pointed at the
 * second through both doors.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const sinkUrl = process.env.E2E_PAYMENT_SINK ?? 'http://127.0.0.1:8026'

let organizationId = ''
/** The invoice that is paid, and the one the payment is pointed at. */
let paidJobId = ''
let paidInvoiceUrl = ''
let otherJobId = ''
let otherInvoiceUrl = ''
/** The PayPal order paid on the first invoice. */
let order: SinkPayPalOrder | undefined

async function makeSharedInvoice(page: Page, title: string) {
  const vehicleUrl = await seededVehicleUrl(page)
  const jobUrl = await newWorkOrder(page, vehicleUrl, title)
  await addPart(page, { name: `E2E belt ${stamp}`, quantity: 1, unitPrice: 800 })
  await saveWorkOrder(page)
  return { jobId: jobUrl.split('/').pop() ?? '', invoiceUrl: await shareLink(page) }
}

function shareParts(invoiceUrl: string) {
  const [org, token] = new URL(invoiceUrl).pathname.split('/').slice(-2)
  return { org, token }
}

test.beforeAll(async ({ browser }) => {
  await clearPaymentSink()
  await forgetConnections(['paypal'])
  organizationId = await ownerOrganizationId()

  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await connectVendor(page, 'paypal', {
    clientId: `e2e-client-${stamp}`,
    clientSecret: `e2e-secret-${stamp}`,
  })
  await expectConnection('paypal', 'active')
  ;({ jobId: paidJobId, invoiceUrl: paidInvoiceUrl } = await makeSharedInvoice(
    page,
    `E2E paid invoice ${stamp}`
  ))
  ;({ jobId: otherJobId, invoiceUrl: otherInvoiceUrl } = await makeSharedInvoice(
    page,
    `E2E other invoice ${stamp}`
  ))
  await page.close()
})

test.afterAll(async () => {
  // A connected vendor puts a pay button on every shared invoice.
  await forgetConnections(['paypal'])
})

test.describe('a PayPal order', () => {
  test('paid on one invoice is booked on that invoice', async ({ page }) => {
    await page.goto(paidInvoiceUrl)
    await settle(page)
    await expect(async () => {
      await page.getByRole('button', { name: 'Partial payment', exact: true }).click()
      await expect(page.locator('#payAmount')).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await page.locator('#payAmount').fill('100')
    await page.getByRole('button', { name: /with PayPal$/ }).click()
    await expect(page.getByRole('heading', { name: /checkout/ })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Pay', exact: true }).click()
    await expect(page.getByText('Payment received!')).toBeVisible({ timeout: 30_000 })

    order = (await paymentSink()).paypal.find(
      (o) => o.custom_id === `${paidJobId}:${organizationId}` && o.status === 'COMPLETED'
    )
    expect(order, 'PayPal holds a completed order for the first invoice').toBeTruthy()
    expect((await paymentsFor(paidJobId)).map((p) => [p.provider, p.amount])).toEqual([
      ['paypal', 100],
    ])
    expect(await paymentsFor(otherJobId), 'and nothing on the other').toEqual([])
  })

  test('is refused by another invoice’s return page', async ({ request }) => {
    // The customer's browser, back from PayPal, with the other invoice's
    // link and the paid order's id.
    const { org, token } = shareParts(otherInvoiceUrl)
    const response = await request.post(`/api/public/share/invoice/${org}/${token}/verify`, {
      data: { provider: 'paypal', externalId: order?.id },
    })
    expect(response.status()).toBe(400)
    expect(await response.json()).toEqual({ error: 'Payment does not belong to this invoice' })
    expect(await paymentsFor(otherJobId), 'nothing was booked').toEqual([])
  })

  test('is refused by a notification that names another invoice', async ({ request }) => {
    // An order already on the books is answered without another look, so the
    // forgery has to be an order the app has not seen: created for the first
    // invoice, approved and captured at the vendor, and never brought back
    // to the app. That is what a notification that arrives first looks like.
    const { org, token } = shareParts(paidInvoiceUrl)
    const checkout = await request.post(`/api/public/share/invoice/${org}/${token}/checkout`, {
      data: { provider: 'paypal', amount: 50 },
    })
    expect(checkout.status()).toBe(200)
    const fresh = (await paymentSink()).paypal.find(
      (o) =>
        o.custom_id === `${paidJobId}:${organizationId}` && o.status === 'PAYER_ACTION_REQUIRED'
    )
    expect(fresh, 'PayPal holds the new order').toBeTruthy()
    await fetch(`${sinkUrl}/pay/paypal/${fresh?.id}`, { method: 'POST', redirect: 'manual' })
    const captured = await fetch(`${sinkUrl}/v2/checkout/orders/${fresh?.id}/capture`, {
      method: 'POST',
      headers: { authorization: 'Bearer E2E-ACCESS-TOKEN' },
    })
    expect(captured.status, 'the order is paid at the vendor').toBe(201)

    // PayPal's notification carries the invoice in `custom_id`; here it is
    // rewritten to the other invoice while the order stays the paid one.
    const notify = (customId: string) =>
      request.post('/api/webhooks/paypal', {
        data: {
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          resource: {
            id: `CAP-${fresh?.id}`,
            custom_id: customId,
            supplementary_data: { related_ids: { order_id: fresh?.id } },
          },
        },
      })

    const forged = await notify(`${otherJobId}:${organizationId}`)
    expect(forged.status()).toBe(400)
    expect(await forged.json()).toEqual({ error: 'Order does not belong to this record' })
    expect(await paymentsFor(otherJobId), 'nothing was booked').toEqual([])

    // The other invoice's return page is refused the same order.
    const other = shareParts(otherInvoiceUrl)
    const verify = await request.post(
      `/api/public/share/invoice/${other.org}/${other.token}/verify`,
      { data: { provider: 'paypal', externalId: fresh?.id } }
    )
    expect(verify.status()).toBe(400)
    expect(await paymentsFor(otherJobId), 'still nothing').toEqual([])

    // And the genuine notification books it where it belongs, once.
    const genuine = await notify(`${paidJobId}:${organizationId}`)
    expect(genuine.status()).toBe(200)
    expect((await paymentsFor(paidJobId)).map((p) => [p.provider, p.amount])).toEqual([
      ['paypal', 100],
      ['paypal', 50],
    ])
  })

  test('leaves the other invoice untouched', async () => {
    expect((await paymentsFor(paidJobId)).length).toBe(2)
    expect(await paymentsFor(otherJobId)).toEqual([])
  })
})
