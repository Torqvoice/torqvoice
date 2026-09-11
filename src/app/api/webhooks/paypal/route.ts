import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { paymentProviderFor } from '@/features/integrations/Lib/payments'
import { paymentMatchesRecord } from '@/lib/payment-providers/attribution'
import { recordVendorPayment } from '@/lib/payment-providers/record-payment'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // PayPal webhook event
    const eventType = body.event_type as string | undefined

    if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') {
      return NextResponse.json({ received: true })
    }

    const resource = body.resource
    if (!resource) {
      return NextResponse.json({ error: 'Missing resource' }, { status: 400 })
    }

    // Extract custom_id which contains "serviceRecordId:orgId"
    const customId = resource.custom_id || resource.supplementary_data?.related_ids?.custom_id
    const orderId = resource.supplementary_data?.related_ids?.order_id || resource.id

    if (!customId || !orderId) {
      return NextResponse.json({ error: 'Missing custom_id or order_id' }, { status: 400 })
    }

    const [serviceRecordId, orgId] = customId.split(':')
    if (!serviceRecordId || !orgId) {
      return NextResponse.json({ error: 'Invalid custom_id format' }, { status: 400 })
    }

    return await processPayPalPayment(orderId, orgId, serviceRecordId)
  } catch (error) {
    console.error('[PayPal Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processPayPalPayment(orderId: string, orgId: string, serviceRecordId: string) {
  // A shortcut, not the guarantee: an order already on the books is not sent
  // back to PayPal to be captured again. The write below is what keeps two
  // reports arriving together from both booking it.
  const existing = await db.payment.findFirst({
    where: { externalId: orderId },
  })
  if (existing) {
    return NextResponse.json({ received: true })
  }

  const connected = await paymentProviderFor(orgId, 'paypal')
  if (!connected) {
    return NextResponse.json({ error: 'PayPal not configured for this org' }, { status: 400 })
  }

  // Verify the order with PayPal API
  const result = await connected.provider.verifyPayment(orderId)

  if (!result || !result.paid) {
    return NextResponse.json({ received: true, status: 'not_paid' })
  }

  // The order PayPal verified must be the one created for this record. The
  // custom_id in the event body is the caller's claim; the one PayPal hands
  // back with the order is the truth.
  if (!paymentMatchesRecord(result, { serviceRecordId, organizationId: orgId })) {
    console.warn(
      `[PayPal Webhook] Order ${orderId} was not created for record ${serviceRecordId} of organization ${orgId}; ignoring`
    )
    return NextResponse.json({ error: 'Order does not belong to this record' }, { status: 400 })
  }

  // Verify service record exists and belongs to this org
  const record = await db.serviceRecord.findUnique({
    where: { id: serviceRecordId },
    select: { id: true, organizationId: true },
  })

  if (record && record.organizationId === orgId) {
    await recordVendorPayment({
      amount: result.amount,
      method: 'paypal',
      provider: 'paypal',
      externalId: orderId,
      serviceRecordId,
    })
  }

  return NextResponse.json({ received: true })
}
