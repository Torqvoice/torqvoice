import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { PAYMENT_CONNECTOR_IDS, paymentProviderFor } from '@/features/integrations/Lib/payments'
import { rateLimit } from '@/lib/rate-limit'
import { notify } from '@/lib/notify'
import { resolvePortalOrg } from '@/lib/portal-slug'

const verifySchema = z.object({
  provider: z.enum(PAYMENT_CONNECTOR_IDS as [string, ...string[]]),
  externalId: z.string().min(1),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> }
) {
  const limited = rateLimit(request, { limit: 10, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { orgId: orgParam, token } = await params

    // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
    const resolvedOrg = await resolvePortalOrg(orgParam)
    const orgId = resolvedOrg?.id ?? orgParam

    const record = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      include: {
        customer: { select: { name: true } },
        vehicle: { select: { id: true, customer: { select: { name: true } } } },
      },
    })

    if (!record || record.organizationId !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = verifySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { provider, externalId } = parsed.data

    // The customer is back from the vendor, so the money may already have
    // moved: a vendor the workshop paused in the meantime still gets its
    // payment recorded, as long as it is connected.
    const connected = await paymentProviderFor(orgId, provider)
    if (!connected) {
      return NextResponse.json({ error: `Provider "${provider}" is not enabled` }, { status: 400 })
    }

    const result = await connected.provider.verifyPayment(externalId)

    if (!result || !result.paid) {
      return NextResponse.json({ verified: false })
    }

    // Idempotent: check if payment with this externalId already exists
    const existing = await db.payment.findFirst({
      where: { externalId },
    })

    if (!existing) {
      await db.payment.create({
        data: {
          amount: result.amount,
          method: provider,
          provider,
          externalId,
          serviceRecordId: record.id,
        },
      })

      notify({
        organizationId: orgId,
        type: 'invoice_payment',
        title: 'Invoice Payment Received',
        message: `${(record.customer ?? record.vehicle?.customer)?.name || 'A customer'} paid ${result.amount.toFixed(2)} for invoice ${record.invoiceNumber || record.title}`,
        entityType: 'invoice',
        entityId: record.id,
        entityUrl: record.vehicle
          ? `/vehicles/${record.vehicle.id}?tab=service&record=${record.id}`
          : `/sales/${record.id}`,
      })
    }

    return NextResponse.json({
      verified: true,
      amount: result.amount,
    })
  } catch (error) {
    console.error('[Verify] Error:', error)
    const message = error instanceof Error ? error.message : 'Verification failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
