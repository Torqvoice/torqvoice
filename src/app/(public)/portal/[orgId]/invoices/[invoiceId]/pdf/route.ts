import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { getCustomerSession } from '@/lib/customer-session'
import { buildInvoicePdfBuffer } from '@/features/invoices/Pdf/buildInvoicePdfBuffer'

// This route lives under /portal/... (not /api/public/...) so the
// customer-session cookie — which is scoped to path "/portal" — is
// actually sent by the browser. See verify route's cookie options.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; invoiceId: string }> }
) {
  const limited = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { orgId: orgParam, invoiceId } = await params

    // Customers hit this URL directly via a download link in the portal, so
    // a redirect to the login page is friendlier than a JSON 401.
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
        id: true,
        status: true,
        vehicle: { select: { customerId: true, organizationId: true } },
      },
    })

    if (!record) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (
      record.vehicle.customerId !== session.customerId ||
      record.vehicle.organizationId !== session.organizationId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only completed records are downloadable as invoices. Work-in-progress
    // records aren't real invoices yet (prices may still change).
    if (record.status !== 'completed') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const headerStore = await headers()
    const result = await buildInvoicePdfBuffer(record.id, headerStore.get('accept-language'))

    if (!result) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return new NextResponse(
      result.buffer.buffer.slice(
        result.buffer.byteOffset,
        result.buffer.byteOffset + result.buffer.byteLength
      ) as ArrayBuffer,
      {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${result.filename}"`,
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    )
  } catch (error) {
    console.error('[Portal Invoice PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
