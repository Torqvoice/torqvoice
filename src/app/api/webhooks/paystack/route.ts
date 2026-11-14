import { NextResponse } from 'next/server'
import { paymentProviderFor } from '@/features/integrations/Lib/payments'
import { isRestoring } from '@/lib/backup/freeze'
import { restoringResponse } from '@/lib/backup/freeze-response'
import { db } from '@/lib/db'
import { paymentMatchesRecord } from '@/lib/payment-providers/attribution'
import { paystackAttribution, paystackSignatureValid } from '@/lib/payment-providers/paystack'
import { recordVendorPayment } from '@/lib/payment-providers/record-payment'

interface PaystackEvent {
  event?: unknown
  data?: { reference?: unknown; metadata?: unknown }
}

export async function POST(request: Request) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-paystack-signature')

    // Parsed without trusting it, only to learn which workshop this is for,
    // so that workshop's key can check the signature. Nothing from the body
    // is recorded: the amount and the record come from Paystack's own answer.
    let event: PaystackEvent
    try {
      event = JSON.parse(body) as PaystackEvent
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    if (event.event !== 'charge.success') {
      return NextResponse.json({ received: true })
    }

    const reference = typeof event.data?.reference === 'string' ? event.data.reference : ''
    const claimed = paystackAttribution({ metadata: event.data?.metadata })
    // A charge that carries no record of ours was made somewhere else on the
    // workshop's Paystack account: a payment page, another shop. Not an error.
    if (!reference || !claimed.organizationId || !claimed.serviceRecordId) {
      return NextResponse.json({ received: true })
    }
    const orgId = claimed.organizationId
    const serviceRecordId = claimed.serviceRecordId

    const connected = await paymentProviderFor(orgId, 'paystack')
    const secretKey = connected?.setup.credentials.secretKey
    if (!connected || typeof secretKey !== 'string' || !secretKey) {
      return NextResponse.json({ error: 'Paystack not configured for this org' }, { status: 400 })
    }

    // Paystack signs with the account's secret key, so a valid signature
    // means the sender holds this workshop's key.
    if (!paystackSignatureValid(body, signature, secretKey.trim())) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    // A payment booked now would be lost under the restore; Paystack retries after it.
    if (isRestoring(orgId)) return restoringResponse()

    // Asked of Paystack itself, so the amount and the record are its word
    // and not the notification's.
    const result = await connected.provider.verifyPayment(reference)
    if (!result || !result.paid) {
      return NextResponse.json({ received: true, status: 'not_paid' })
    }

    if (!paymentMatchesRecord(result, { serviceRecordId, organizationId: orgId })) {
      console.warn(
        `[Paystack Webhook] Transaction ${reference} was not created for record ${serviceRecordId} of organization ${orgId}; ignoring`
      )
      return NextResponse.json(
        { error: 'Transaction does not belong to this record' },
        { status: 400 }
      )
    }

    const record = await db.serviceRecord.findUnique({
      where: { id: serviceRecordId },
      select: { id: true, organizationId: true },
    })

    if (record && record.organizationId === orgId) {
      // Once, however many reports arrive together: Paystack retries, and
      // the customer coming back to the invoice reports the same reference.
      await recordVendorPayment({
        amount: result.amount,
        method: 'paystack',
        provider: 'paystack',
        externalId: reference,
        serviceRecordId,
      })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Paystack Webhook] Error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
