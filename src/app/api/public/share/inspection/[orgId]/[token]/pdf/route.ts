import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { buildCustomerCertificatePdf } from '@/features/inspections/Pdf/customerCertificatePdf'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> }
) {
  try {
    const { orgId: orgParam, token } = await params

    // Resolve slug (e.g. "egelandauto") or UUID to the real org ID
    const resolvedOrg = await resolvePortalOrg(orgParam)
    const orgId = resolvedOrg?.id ?? orgParam

    const headerStore = await headers()
    const locale = await resolveCustomerLocale(orgId, headerStore.get('accept-language'))

    // The share link names the inspection; the designed certificate, when the
    // workshop has one, is then the same document the workshop downloads.
    const shared = await db.inspection.findFirst({
      where: { publicToken: token, organizationId: orgId },
      select: { id: true },
    })
    if (!shared) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }
    const certificate = await buildCustomerCertificatePdf({
      inspectionId: shared.id,
      organizationId: orgId,
      locale,
    })
    if (!certificate) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 })
    }

    return new NextResponse(certificate.body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${certificate.fileName}"`,
      },
    })
  } catch (error) {
    console.error('[Public Inspection PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
