import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getCustomerSession } from '@/lib/customer-session'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import {
  certificateDownload,
  linkedCertificatePdf,
} from '@/features/inspections/Pdf/customerCertificatePdf'

// Under /portal/... like the invoice PDF beside it, so the customer-session
// cookie scoped to "/portal" is sent.

/** The certificate of the inspection linked to one of the customer's invoices. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; invoiceId: string }> }
) {
  const limited = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { orgId: orgParam, invoiceId } = await params

    const session = await getCustomerSession()
    if (!session) {
      return NextResponse.redirect(new URL(`/portal/${orgParam}/auth/login`, request.url), 302)
    }

    const org = await resolvePortalOrg(orgParam)
    if (!org) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (org.id !== session.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const record = await db.serviceRecord.findUnique({
      where: { id: invoiceId },
      select: {
        status: true,
        customerId: true,
        organizationId: true,
        inspectionId: true,
        vehicle: { select: { customerId: true } },
      },
    })
    if (!record) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const recordCustomerId = record.customerId ?? record.vehicle?.customerId ?? null
    if (
      recordCustomerId !== session.customerId ||
      record.organizationId !== session.organizationId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    // The same rule as the invoice itself: only a finished job is an invoice.
    if (record.status !== 'completed') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const locale = await resolveCustomerLocale(
      session.organizationId,
      (await headers()).get('accept-language')
    )
    const certificate = await linkedCertificatePdf(
      session.organizationId,
      record.inspectionId,
      locale
    )
    if (!certificate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return certificateDownload(certificate)
  } catch (error) {
    console.error('[Portal invoice certificate] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
