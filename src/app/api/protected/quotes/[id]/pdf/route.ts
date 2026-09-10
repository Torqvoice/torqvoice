import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildQuotePdfBuffer } from '@/features/quotes/Pdf/buildQuotePdfBuffer'
import { getAuthContext } from '@/lib/get-auth-context'

/**
 * The workshop's own copy of a quote, and the preview dialog behind it.
 *
 * The document itself is built by `buildQuotePdfBuffer`, which the public
 * share link and the emailed copy also go through: three surfaces, one sheet.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    // The workshop reads its own copy in its own language; a customer's copy
    // follows the customer's.
    const locale = (await cookies()).get('locale')?.value || 'en'

    const pdf = await buildQuotePdfBuffer(id, ctx.organizationId, locale)
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
    console.error('[Quote PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
