import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { resolvePortalOrg } from '@/lib/portal-slug'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import {
  certificateDownload,
  linkedCertificatePdf,
} from '@/features/inspections/Pdf/customerCertificatePdf'

/**
 * The certificate of the inspection linked to a shared invoice. The invoice's
 * share link is what the workshop sent, and the certificate rides along with
 * it, so the inspection needs no share link of its own.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> }
) {
  const limited = rateLimit(request, { limit: 20, windowMs: 60_000 })
  if (limited) return limited

  try {
    const { orgId: orgParam, token } = await params
    const resolvedOrg = await resolvePortalOrg(orgParam)
    const orgId = resolvedOrg?.id ?? orgParam

    const record = await db.serviceRecord.findUnique({
      where: { publicToken: token },
      select: { organizationId: true, inspectionId: true },
    })
    if (!record || record.organizationId !== orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const locale = await resolveCustomerLocale(orgId, (await headers()).get('accept-language'))
    const certificate = await linkedCertificatePdf(orgId, record.inspectionId, locale)
    if (!certificate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return certificateDownload(certificate)
  } catch (error) {
    console.error('[Public invoice certificate] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
