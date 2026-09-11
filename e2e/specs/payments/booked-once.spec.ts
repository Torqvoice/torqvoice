import { expect, test } from '@playwright/test'
import Stripe from 'stripe'
import {
  deleteVendorPaymentRows,
  forgetConnections,
  insertVendorPaymentRow,
  vendorPaymentRows,
} from '../../support/db'
import { connectVendor, expectConnection, paymentSink } from '../../support/payments'
import {
  addPart,
  newWorkOrder,
  saveWorkOrder,
  seededVehicleUrl,
  shareLink,
} from '../../support/work-order'

/**
 * One payment, one row, however many times it is reported at once.
 *
 * A customer who pays is reported twice by design: their browser comes back
 * to the invoice and asks for the payment to be checked, and the vendor sends
 * a notification of its own, often in the same second. Stripe retries its
 * notifications as well. Every one of those paths used to ask "is this
 * payment recorded yet?" and then record it, as two separate steps, so two
 * reports arriving together could both see nothing and both write a row: the
 * invoice then showed twice the money the customer had paid. It happened two
 * times in five when this was first tried against the running app.
 *
 * The sequential case is in `checkout.spec.ts`. This file is the concurrent
 * one, and it has to be: a race is only caught by racing.
 */

test.describe.configure({ mode: 'serial' })

const stamp = Date.now()
const SECRET = `whsec_once_${stamp}`
const ROUNDS = 6
/** The browser coming back, plus Stripe's notification and two of its retries. */
const WEBHOOKS_PER_ROUND = 3

let jobId = ''
let org = ''
let token = ''

test.beforeAll(async ({ browser }) => {
  await forgetConnections(['stripe', 'paypal'])
  const page = await browser.newPage({ storageState: 'e2e/.auth/owner.json' })
  await connectVendor(page, 'stripe', { secretKey: `sk_test_once_${stamp}`, webhookSecret: SECRET })
  await expectConnection('stripe', 'active')

  const jobUrl = await newWorkOrder(page, await seededVehicleUrl(page), `E2E booked once ${stamp}`)
  jobId = jobUrl.split('/').pop() ?? ''
  await addPart(page, { name: `E2E once part ${stamp}`, quantity: 1, unitPrice: 800 })
  await saveWorkOrder(page)
  await page.goto(jobUrl)
  ;[org, token] = new URL(await shareLink(page)).pathname.split('/').slice(-2)
  await page.close()
})

test.afterAll(async () => {
  await forgetConnections(['stripe', 'paypal'])
})

test('the database refuses a second row for a payment it already holds', async () => {
  // Not timing, so not luck: whatever the app does, the table itself must
  // not hold the same vendor payment against the same invoice twice.
  const externalId = `cs_test_constraint_${stamp}`
  try {
    const first = await insertVendorPaymentRow({
      serviceRecordId: jobId,
      provider: 'stripe',
      externalId,
      amount: 1,
    })
    expect(first, 'the first row goes in').toBeNull()

    const second = await insertVendorPaymentRow({
      serviceRecordId: jobId,
      provider: 'stripe',
      externalId,
      amount: 1,
    })
    expect(second, 'the second is refused as a unique violation').toBe('23505')
    expect(await vendorPaymentRows(jobId, externalId)).toBe(1)
  } finally {
    await deleteVendorPaymentRows(externalId)
  }
})

test('a payment reported by the browser and by Stripe at the same moment is booked once', async ({
  request,
}) => {
  const rows: number[] = []

  for (let round = 0; round < ROUNDS; round++) {
    const checkout = await request.post(`/api/public/share/invoice/${org}/${token}/checkout`, {
      data: { provider: 'stripe', amount: 10 },
    })
    expect(checkout.ok(), `checkout in round ${round}`).toBe(true)
    const { externalId } = (await checkout.json()) as { externalId: string }

    // The customer pays at the vendor.
    await request.post(`http://127.0.0.1:8026/pay/stripe/${externalId}`, { maxRedirects: 0 })
    const session = (await paymentSink()).stripe.find((s) => s.id === externalId)
    expect(session?.payment_status, `paid at the vendor in round ${round}`).toBe('paid')

    const payload = JSON.stringify({
      id: `evt_once_${stamp}_${round}`,
      object: 'event',
      type: 'checkout.session.completed',
      data: { object: session },
    })
    const signature = new Stripe('sk_test_unused').webhooks.generateTestHeaderString({
      payload,
      secret: SECRET,
    })
    const notify = () =>
      request.post('/api/webhooks/stripe', {
        data: payload,
        headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      })

    // Everything at once, the way it arrives when it goes wrong.
    const answers = await Promise.all([
      request.post(`/api/public/share/invoice/${org}/${token}/verify`, {
        data: { provider: 'stripe', externalId },
      }),
      ...Array.from({ length: WEBHOOKS_PER_ROUND }, notify),
    ])
    for (const answer of answers) {
      expect(answer.status(), 'no report is turned away with an error').toBeLessThan(500)
    }

    rows.push(await vendorPaymentRows(jobId, externalId))
  }

  expect(rows, `rows per payment across ${ROUNDS} rounds`).toEqual(Array(ROUNDS).fill(1))
})
