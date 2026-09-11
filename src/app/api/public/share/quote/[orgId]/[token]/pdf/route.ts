import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildQuotePdfBuffer } from '@/features/quotes/Pdf/buildQuotePdfBuffer'
import { resolveCustomerLocale } from '@/i18n/locale-from-request'
import { db } from '@/lib/db'
import { resolvePortalOrg } from '@/lib/portal-slug'

/**
 * The customer's copy of a quote, behind the share link's token.
 *
 * The token is the whole of the permission: it is unguessable, and holding it
 * is how a customer was given the quote. The document is built by
 * `buildQuotePdfBuffer`, the same one the workshop downloads and the same one
 * an email attaches, so the three cannot drift apart.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ orgId: string; token: string }> }
) {
  try {
    const { orgId: orgParam, token } = await params

    // The link may carry a slug ("egelandauto") or the organisation's id.
    const resolvedOrg = await resolvePortalOrg(orgParam)
    const organizationId = resolvedOrg?.id ?? orgParam

    const quote = await db.quote.findFirst({
      where: { publicToken: token, organizationId },
      select: { id: true },
    })
    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    // The reader's language, not the workshop's: this copy is the customer's.
    const locale = await resolveCustomerLocale(
      organizationId,
      (await headers()).get('accept-language')
    )

    const pdf = await buildQuotePdfBuffer(quote.id, organizationId, locale)
    if (!pdf) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    return new NextResponse(pdf.buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
      },
    })
  } catch (error) {
    console.error('[Public Quote PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
