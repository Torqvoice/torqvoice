import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { paymentProviderFor } from '@/features/integrations/Lib/payments'
import { paymentMatchesRecord } from '@/lib/payment-providers/attribution'
import { recordVendorPayment } from '@/lib/payment-providers/record-payment'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    // Vipps sends callbacks with reference and status
    const reference = body.reference as string | undefined
    const orgId = body.metadata?.orgId as string | undefined
    const serviceRecordId = body.metadata?.serviceRecordId as string | undefined

    if (!reference || !orgId || !serviceRecordId) {
      // Try to extract from the reference pattern: inv-{serviceRecordId}-{timestamp}
      if (reference) {
        const parts = reference.match(/^inv-(.+)-\d+$/)
        if (parts) {
          // We need orgId from the service record lookup
          const record = await db.serviceRecord.findUnique({
            where: { id: parts[1] },
            select: { id: true, organizationId: true },
          })

          if (record) {
            return await processVippsPayment(reference, record.organizationId!, record.id)
          }
        }
      }
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    return await processVippsPayment(reference, orgId, serviceRecordId)
  } catch (error) {
    console.error('[Vipps Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

async function processVippsPayment(reference: string, orgId: string, serviceRecordId: string) {
  // A shortcut, not the guarantee: a payment already on the books is not
  // checked with Vipps again. The write below is what keeps two reports
  // arriving together from both booking it.
  const existing = await db.payment.findFirst({
    where: { externalId: reference },
  })
  if (existing) {
    return NextResponse.json({ received: true })
  }

  const connected = await paymentProviderFor(orgId, 'vipps')
  if (!connected) {
    return NextResponse.json({ error: 'Vipps not configured for this org' }, { status: 400 })
  }

  const result = await connected.provider.verifyPayment(reference)

  if (!result || !result.paid) {
    return NextResponse.json({ received: true, status: 'not_paid' })
  }

  // The payment Vipps verified must be the one created for this record. The
  // metadata in the callback body is the caller's claim; what Vipps returns
  // with the payment is the truth.
  if (!paymentMatchesRecord(result, { serviceRecordId, organizationId: orgId })) {
    console.warn(
      `[Vipps Webhook] Payment ${reference} was not created for record ${serviceRecordId} of organization ${orgId}; ignoring`
    )
    return NextResponse.json({ error: 'Payment does not belong to this record' }, { status: 400 })
  }

  // Verify service record exists and belongs to this org
  const record = await db.serviceRecord.findUnique({
    where: { id: serviceRecordId },
    select: { id: true, organizationId: true },
  })

  if (record && record.organizationId === orgId) {
    await recordVendorPayment({
      amount: result.amount,
      method: 'vipps',
      provider: 'vipps',
      externalId: reference,
      serviceRecordId,
    })
  }

  return NextResponse.json({ received: true })
}
