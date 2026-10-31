import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { RESTORE_IN_PROGRESS_MESSAGE, isRestoring } from '@/lib/backup/freeze'

/** A view stamp written under a restore would be lost with it; the page does not wait for it. */
function restoring(organizationId: string | null) {
  return organizationId && isRestoring(organizationId)
    ? NextResponse.json({ error: RESTORE_IN_PROGRESS_MESSAGE }, { status: 409 })
    : null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { type, token } = body

    if (!type || !token || !['quote', 'invoice'].includes(type)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    if (type === 'quote') {
      const quote = await db.quote.findFirst({
        where: { publicToken: token },
        select: { id: true, organizationId: true },
      })
      if (!quote) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const refused = restoring(quote.organizationId)
      if (refused) return refused
      await db.quote.update({
        where: { id: quote.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
    } else {
      const record = await db.serviceRecord.findFirst({
        where: { publicToken: token },
        select: { id: true, organizationId: true },
      })
      if (!record) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
      }
      const refused = restoring(record.organizationId)
      if (refused) return refused
      await db.serviceRecord.update({
        where: { id: record.id },
        data: {
          viewCount: { increment: 1 },
          lastViewedAt: new Date(),
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
