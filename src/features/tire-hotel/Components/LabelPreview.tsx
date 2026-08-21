'use client'

import { QRCodeSVG } from 'qrcode.react'
import { useTranslations } from 'next-intl'
import { LABEL_SPECS, labelLayout, type LabelFormat, type LabelLayout } from '../Lib/labels'
import type { LabelPreview as LabelPreviewData } from '../Actions/getLabelPreview'

/**
 * What the sticker will look like, at the shape it will print.
 *
 * Sizes and what survives at each label size come from labelLayout, the same
 * function the PDF reads, so the preview cannot flatter a format the printer
 * will not deliver. Only the units differ: points there, CSS pixels here.
 *
 * The whole label is drawn at its true size and then scaled to fit the panel,
 * which keeps the proportions honest. That is the one thing a preview at this
 * size can usefully show.
 */

/** CSS pixels per PDF point at the conventional 96dpi. */
const PX_PER_PT = 96 / 72
const PX_PER_MM = 96 / 25.4

export function LabelPreview({
  data,
  format,
  url,
  maxWidth = 300,
  maxHeight = 260,
}: {
  data: LabelPreviewData
  format: LabelFormat
  url: string
  maxWidth?: number
  maxHeight?: number
}) {
  const t = useTranslations('tireHotel')
  const spec = LABEL_SPECS[format]
  const layout = labelLayout(spec.detail)

  const baseWidth = spec.widthMm * PX_PER_MM
  const baseHeight = spec.heightMm * PX_PER_MM
  // Never scale up: a small label shown large would misrepresent how much
  // room the text actually has.
  const scale = Math.min(maxWidth / baseWidth, maxHeight / baseHeight, 1)

  const identity = data.plate || data.customer || data.reference || t('label.unassigned')
  const tireLine = [data.brand, data.size, t(`seasons.${data.season}`)].filter(Boolean).join(' · ')
  const flags = [
    data.withRims ? t('label.withRims') : null,
    data.hasTpms ? t('label.tpms') : null,
    data.studded ? t('label.studded') : null,
  ].filter(Boolean) as string[]

  const pt = (points: number) => `${points * PX_PER_PT}px`

  return (
    <div
      className="flex items-center justify-center"
      style={{ width: baseWidth * scale, height: baseHeight * scale }}
    >
      <div
        className="shrink-0 overflow-hidden border border-dashed border-border bg-white text-black shadow-sm"
        style={{
          width: baseWidth,
          height: baseHeight,
          transform: `scale(${scale})`,
          transformOrigin: 'center',
        }}
      >
        {layout.stacked ? (
          <div
            className="flex h-full flex-col items-center justify-center text-center"
            style={{ padding: pt(layout.padding) }}
          >
            <QRCodeSVG value={url} size={layout.qr * PX_PER_PT} level="M" />
            {layout.showUrl && (
              <span style={{ fontSize: pt(4), color: '#666666', marginTop: pt(1) }}>{url}</span>
            )}
            <span style={{ fontSize: pt(layout.plate), fontWeight: 700, marginTop: pt(6) }}>
              {identity}
            </span>
            {data.customer && data.plate && (
              <span style={{ fontSize: pt(layout.body), color: '#333333', marginTop: pt(3) }}>
                {data.customer}
              </span>
            )}
            <span style={{ fontSize: pt(layout.body), color: '#333333', marginTop: pt(3) }}>
              {tireLine}
            </span>
            {layout.showQuantity && (
              <span style={{ fontSize: pt(layout.body), color: '#333333', marginTop: pt(3) }}>
                {t('label.quantity', { count: data.quantity })}
              </span>
            )}
            <Flags flags={flags} layout={layout} pt={pt} />
            {data.reference && (
              <span style={{ fontSize: pt(layout.reference), fontWeight: 700, marginTop: pt(2) }}>
                {t('label.reference')} {data.reference}
              </span>
            )}
            <span style={{ fontSize: pt(layout.footer), color: '#777777', marginTop: pt(1) }}>
              {data.shopName}
            </span>
          </div>
        ) : (
          <div className="flex h-full items-center" style={{ padding: pt(layout.padding) }}>
            <div style={{ marginRight: pt(6) }}>
              <QRCodeSVG value={url} size={layout.qr * PX_PER_PT} level="M" />
            </div>
            <div className="min-w-0 flex-1">
              <div style={{ fontSize: pt(layout.plate), fontWeight: 700 }}>{identity}</div>

              {layout.showDetail ? (
                <>
                  {data.customer && data.plate && (
                    <div style={{ fontSize: pt(layout.body), color: '#333333', marginTop: pt(1) }}>
                      {data.customer}
                    </div>
                  )}
                  <div style={{ fontSize: pt(layout.body), color: '#333333', marginTop: pt(1) }}>
                    {tireLine}
                  </div>
                  <Flags flags={flags} layout={layout} pt={pt} />
                  <div style={{ fontSize: pt(layout.footer), color: '#777777', marginTop: pt(1) }}>
                    {data.reference ? `${t('label.reference')} ${data.reference} · ` : ''}
                    {data.shopName}
                  </div>
                </>
              ) : data.reference ? (
                <div style={{ fontSize: pt(layout.reference), fontWeight: 700, marginTop: pt(2) }}>
                  {t('label.reference')} {data.reference}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Flags({
  flags,
  layout,
  pt,
}: {
  flags: string[]
  layout: LabelLayout
  pt: (points: number) => string
}) {
  if (flags.length === 0) return null
  return (
    <div className="flex" style={{ marginTop: pt(2) }}>
      {flags.map((flag) => (
        <span
          key={flag}
          style={{
            fontSize: pt(layout.flag),
            border: '0.5px solid #999999',
            borderRadius: pt(2),
            padding: `${pt(0.5)} ${pt(2)}`,
            marginRight: pt(2),
            whiteSpace: 'nowrap',
          }}
        >
          {flag}
        </span>
      ))}
    </div>
  )
}
