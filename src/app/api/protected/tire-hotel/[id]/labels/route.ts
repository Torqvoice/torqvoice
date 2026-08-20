import { NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import '@/features/vehicles/Components/invoice-pdf/fonts'
import { cookies } from 'next/headers'
import { createTranslator } from 'next-intl'
import { getAuthContext } from '@/lib/get-auth-context'
import { db } from '@/lib/db'
import { generateQrDataUri } from '@/lib/qr'
import { isTireHotelEnabled } from '@/features/tire-hotel/Lib/tireHotelSettings'
import {
  LABEL_FORMATS,
  defaultCopies,
  type LabelData,
  type LabelFormat,
} from '@/features/tire-hotel/Lib/labels'
import { TireLabelPDF, type LabelLabels } from '@/features/tire-hotel/Components/TireLabelPDF'

/**
 * Printable stickers for one stored set.
 *
 * Rendered server-side because the QR encoder is a node library and the label
 * has to come back as a file a label printer can take. The response is inline
 * rather than an attachment so the browser print dialog opens straight onto
 * it, which is the whole interaction on a roll printer.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await isTireHotelEnabled(ctx.organizationId))) {
      return NextResponse.json({ error: 'Tire hotel is not enabled' }, { status: 404 })
    }

    const { id } = await params
    const url = new URL(request.url)

    const requested = url.searchParams.get('format') ?? 'dymo_standard'
    const format: LabelFormat = (LABEL_FORMATS as readonly string[]).includes(requested)
      ? (requested as LabelFormat)
      : 'dymo_standard'

    const set = await db.tireSet.findFirst({
      where: { id, organizationId: ctx.organizationId },
      select: {
        id: true,
        reference: true,
        season: true,
        size: true,
        brand: true,
        quantity: true,
        withRims: true,
        hasTpms: true,
        studded: true,
        customer: { select: { name: true } },
        vehicle: { select: { make: true, model: true, licensePlate: true } },
      },
    })
    if (!set) return NextResponse.json({ error: 'Tire set not found' }, { status: 404 })

    const copiesParam = Number(url.searchParams.get('copies'))
    const copies = Number.isFinite(copiesParam)
      ? Math.max(1, Math.min(40, Math.round(copiesParam)))
      : defaultCopies(set.quantity)

    const cookieStore = await cookies()
    const locale = cookieStore.get('locale')?.value || 'en'
    // The namespace mixes strings and nested objects, so it is read loosely
    // and each value checked where it is used.
    let messages: Record<string, unknown>
    try {
      messages = (await import(`../../../../../../../messages/${locale}/tireHotel.json`)).default
    } catch {
      messages = (await import(`../../../../../../../messages/en/tireHotel.json`)).default
    }

    const group = (key: string): Record<string, string> => {
      const value = messages[key]
      return value && typeof value === 'object' ? (value as Record<string, string>) : {}
    }
    // Through next-intl rather than a string replace, so a plural rule is a
    // plural rule. "4 opon" is what a raw substitution prints in Polish, and
    // it is wrong on a sticker somebody has to read.
    // Cast because the messages are read loosely here, which leaves next-intl
    // with no key union to check against.
    const translate = createTranslator({
      locale,
      messages,
      namespace: 'label',
    } as Parameters<typeof createTranslator>[0]) as unknown as (
      key: string,
      values?: Record<string, unknown>
    ) => string

    const label = group('label')
    const labels: LabelLabels = {
      reference: label.reference ?? 'Ref',
      quantity: translate('quantity', { count: set.quantity }),
      withRims: label.withRims ?? 'On rims',
      tpms: label.tpms ?? 'TPMS',
      studded: label.studded ?? 'Studded',
      unassigned: label.unassigned ?? 'Unassigned',
    }
    const seasonLabel = group('seasons')[set.season] ?? set.season

    const org = await db.organization.findUnique({
      where: { id: ctx.organizationId },
      select: { name: true },
    })

    // Absolute, so a phone scanning it away from the app still resolves.
    const target = `${url.origin}/tire-hotel/${set.id}`
    const qr = await generateQrDataUri(target, 320)

    const data: LabelData = {
      tireSetId: set.id,
      reference: set.reference,
      plate: set.vehicle?.licensePlate ?? null,
      vehicle: set.vehicle ? `${set.vehicle.make} ${set.vehicle.model}` : null,
      customer: set.customer?.name ?? null,
      season: set.season,
      size: set.size,
      brand: set.brand,
      quantity: set.quantity,
      withRims: set.withRims,
      hasTpms: set.hasTpms,
      studded: set.studded,
      shopName: org?.name ?? '',
      qr,
      // Shown small under the QR on the large format, so a code that will not
      // scan can still be typed.
      url: target.replace(/^https?:\/\//, ''),
    }

    const element = React.createElement(TireLabelPDF, {
      data,
      format,
      copies,
      labels,
      seasonLabel,
      // Cast because react-pdf's element typing does not describe this.
    }) as any
    const buffer = await renderToBuffer(element)

    const fileName = `tire-labels-${set.reference ?? set.id}.pdf`
    return new NextResponse(
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
      {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `inline; filename="${fileName}"`,
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    console.error('[Tire labels] Render failed:', error)
    return NextResponse.json({ error: 'Could not render the labels' }, { status: 500 })
  }
}
