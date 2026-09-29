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
 * The certificate of the inspection a shared quote was raised from, which
 * rides along with the quote's share link.
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
    const organizationId = resolvedOrg?.id ?? orgParam

    const quote = await db.quote.findFirst({
      where: { publicToken: token, organizationId },
      select: { inspectionId: true },
    })
    if (!quote) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const locale = await resolveCustomerLocale(
      organizationId,
      (await headers()).get('accept-language')
    )
    const certificate = await linkedCertificatePdf(organizationId, quote.inspectionId, locale)
    if (!certificate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return certificateDownload(certificate)
  } catch (error) {
    console.error('[Public quote certificate] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
