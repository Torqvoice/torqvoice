import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import {
  PAYMENT_CONNECTOR_IDS,
  isOffered,
  paymentProviderFor,
} from '@/features/integrations/Lib/payments'
import { writeLog } from '@/features/integrations/Lib/connections'
import { rateLimit } from '@/lib/rate-limit'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { calculateTotals } from '@/lib/tax'

const checkoutSchema = z.object({
  provider: z.enum(PAYMENT_CONNECTOR_IDS as [string, ...string[]]),
  amount: z.number().positive(),
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
        payments: true,
        partItems: true,
        laborItems: true,
        vehicle: {
          select: { organizationId: true },
        },
      },
    })

    if (!record || record.organizationId !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = checkoutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const { provider, amount } = parsed.data

    // Calculate balance due — mirrors invoice-view.tsx so the server's
    // notion of total matches what the customer sees on the share page.
    const partsSubtotal = record.partItems.reduce((sum, p) => sum + p.total, 0)
    const laborSubtotal = record.laborItems.reduce((sum, l) => sum + l.total, 0)
    const computedSubtotal = partsSubtotal + laborSubtotal
    const computedDiscount =
      record.discountType === 'percentage'
        ? computedSubtotal * (record.discountValue / 100)
        : record.discountType === 'fixed'
          ? Math.min(record.discountValue, computedSubtotal)
          : 0
    const { totalAmount: computedTotal } = calculateTotals({
      subtotal: computedSubtotal,
      discountAmount: computedDiscount,
      taxRate: record.taxRate,
      taxInclusive: record.taxInclusive ?? false,
    })
    const displayTotal =
      record.totalAmount > 0 ? record.totalAmount : computedTotal > 0 ? computedTotal : record.cost
    const paidFromPayments = record.payments.reduce((sum, p) => sum + p.amount, 0)
    const totalPaid = record.manuallyPaid ? displayTotal : paidFromPayments
    const balanceDue = displayTotal - totalPaid

    if (balanceDue <= 0) {
      return NextResponse.json({ error: 'Invoice is already paid in full' }, { status: 400 })
    }

    if (amount < 0.01 || amount > balanceDue + 0.01) {
      return NextResponse.json(
        { error: `Amount must be between 0.01 and ${balanceDue.toFixed(2)}` },
        { status: 400 }
      )
    }

    // The vendor's connection, adopted from the old settings rows on the
    // first checkout after the move. A vendor the workshop has paused with
    // the offered switch takes no new payments, whatever the page showed.
    const connected = await paymentProviderFor(orgId, provider)
    if (!connected || !isOffered(connected.setup)) {
      return NextResponse.json(
        { error: `Payment provider "${provider}" is not enabled` },
        { status: 400 }
      )
    }

    const currencySetting = await db.appSetting.findUnique({
      where: { organizationId_key: { organizationId: orgId, key: 'workshop.currencyCode' } },
      select: { value: true },
    })
    const currencyCode = currencySetting?.value || 'USD'
    const invoiceNumber = record.invoiceNumber || `INV-${record.id.slice(-8).toUpperCase()}`

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
    const invoiceUrl = `${appUrl}/share/invoice/${orgId}/${token}`

    try {
      const result = await connected.provider.createCheckout({
        amount,
        currency: currencyCode,
        invoiceNumber,
        description: `Payment for ${invoiceNumber} - ${record.title}`,
        successUrl: invoiceUrl,
        cancelUrl: invoiceUrl,
        serviceRecordId: record.id,
        orgId,
      })
      return NextResponse.json(result)
    } catch (error) {
      // The vendor's answer is for the workshop, on the connection's
      // activity log, where whoever set the keys up will look. The customer
      // is told only that it did not work.
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Checkout] Error:', error)
      await writeLog(connected.setup.connectionId, 'error', `Checkout failed: ${message}`, {
        invoiceNumber,
        amount,
        currency: currencyCode,
      })
      return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
    }
  } catch (error) {
    console.error('[Checkout] Error:', error)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
