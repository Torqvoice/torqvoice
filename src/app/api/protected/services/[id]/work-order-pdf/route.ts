import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { buildWorkOrderPdfBuffer } from '@/features/invoices/Pdf/buildWorkOrderPdfBuffer'

/**
 * The work order as a PDF: the job as it stands right now, in the
 * workshop's design for it, with a line for the customer to sign. Never
 * frozen and never shared; the workshop prints it and files the paper.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const owned = await db.serviceRecord.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: { id: true },
    })
    if (!owned) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const cookieStore = await cookies()
    const locale = cookieStore.get('locale')?.value || 'en'

    const result = await buildWorkOrderPdfBuffer(owned.id, locale)
    if (!result) {
      return NextResponse.json({ error: 'Record not found' }, { status: 404 })
    }

    const body = result.buffer.buffer.slice(
      result.buffer.byteOffset,
      result.buffer.byteOffset + result.buffer.byteLength
    ) as ArrayBuffer
    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${result.filename}"`,
      },
    })
  } catch (error) {
    console.error('[Work order PDF] Error:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
