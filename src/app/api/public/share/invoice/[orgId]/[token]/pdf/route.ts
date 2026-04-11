import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { buildInvoicePdfBuffer } from '@/features/invoices/Pdf/buildInvoicePdfBuffer'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> }
) {
  const limited = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { orgId: orgParam, token } = await params

    // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
    const resolvedOrg = await resolvePortalOrg(orgParam)
    const orgId = resolvedOrg?.id ?? orgParam

    // Look up the record by public share token and verify it belongs to the
    // org in the URL. The token lookup must stay in the route because the
    // shared helper takes a service-record id.
    const record = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        vehicle: { select: { organizationId: true } },
      },
    })

    if (!record || record.vehicle.organizationId !== orgId) {
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
    console.error('[Public PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
