import { Document, Image, Page, Text, View } from '@react-pdf/renderer'
import {
  LABEL_SPECS,
  SHEET_MARGIN,
  labelLayout,
  type LabelData,
  type LabelFormat,
  type LabelLayout,
  type LabelSpec,
} from '../Lib/labels'

/**
 * The sticker that goes on a tire.
 *
 * Read at arm's length in a cold store by someone holding a wheel, so the
 * plate is the largest thing on it and everything else is support. Sizes and
 * what survives at each label size come from labelLayout, which the on-screen
 * preview reads too, so the two cannot drift apart.
 */

export type LabelLabels = {
  reference: string
  quantity: string
  withRims: string
  tpms: string
  studded: string
  unassigned: string
}

function flagList(data: LabelData, labels: LabelLabels): string[] {
  return [
    data.withRims ? labels.withRims : null,
    data.hasTpms ? labels.tpms : null,
    data.studded ? labels.studded : null,
  ].filter(Boolean) as string[]
}

function Flags({ flags, layout }: { flags: string[]; layout: LabelLayout }) {
  if (flags.length === 0) return null
  return (
    <View style={{ flexDirection: 'row', marginTop: 2 }}>
      {flags.map((flag) => (
        <Text
          key={flag}
          style={{
            fontSize: layout.flag,
            borderWidth: 0.5,
            borderColor: '#999999',
            borderRadius: 2,
            paddingHorizontal: 2,
            paddingVertical: 0.5,
            marginRight: 2,
          }}
        >
          {flag}
        </Text>
      ))}
    </View>
  )
}

function Label({
  data,
  spec,
  labels,
  seasonLabel,
}: {
  data: LabelData
  spec: LabelSpec
  labels: LabelLabels
  seasonLabel: string
}) {
  const layout = labelLayout(spec.detail)
  const identity = data.plate || data.customer || data.reference || labels.unassigned
  const tireLine = [data.brand, data.size, seasonLabel].filter(Boolean).join(' · ')
  const flags = flagList(data, labels)

  if (layout.stacked) {
    return (
      <View
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          padding: layout.padding,
        }}
      >
        <Image src={data.qr} style={{ width: layout.qr, height: layout.qr }} />
        {layout.showUrl && (
          <Text style={{ fontSize: 4, color: '#666666', marginTop: 1 }}>{data.url}</Text>
        )}
        <Text style={{ fontSize: layout.plate, fontWeight: 'bold', marginTop: 6 }}>{identity}</Text>
        {data.customer && data.plate && (
          <Text style={{ fontSize: layout.body, color: '#333333', marginTop: 3 }}>
            {data.customer}
          </Text>
        )}
        <Text style={{ fontSize: layout.body, color: '#333333', marginTop: 3 }}>{tireLine}</Text>
        {layout.showQuantity && (
          <Text style={{ fontSize: layout.body, color: '#333333', marginTop: 3 }}>
            {labels.quantity.replace('{count}', String(data.quantity))}
          </Text>
        )}
        <Flags flags={flags} layout={layout} />
        {data.reference && (
          <Text style={{ fontSize: layout.reference, fontWeight: 'bold', marginTop: 2 }}>
            {labels.reference} {data.reference}
          </Text>
        )}
        <Text style={{ fontSize: layout.footer, color: '#777777', marginTop: 1 }}>
          {data.shopName}
        </Text>
      </View>
    )
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: '100%',
        padding: layout.padding,
      }}
    >
      <View style={{ marginRight: 6 }}>
        <Image src={data.qr} style={{ width: layout.qr, height: layout.qr }} />
      </View>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={{ fontSize: layout.plate, fontWeight: 'bold' }}>{identity}</Text>

        {layout.showDetail ? (
          <>
            {data.customer && data.plate && (
              <Text style={{ fontSize: layout.body, color: '#333333', marginTop: 1 }}>
                {data.customer}
              </Text>
            )}
            <Text style={{ fontSize: layout.body, color: '#333333', marginTop: 1 }}>
              {tireLine}
            </Text>
            <Flags flags={flags} layout={layout} />
            <Text style={{ fontSize: layout.footer, color: '#777777', marginTop: 1 }}>
              {data.reference ? `${labels.reference} ${data.reference} · ` : ''}
              {data.shopName}
            </Text>
          </>
        ) : data.reference ? (
          <Text style={{ fontSize: layout.reference, fontWeight: 'bold', marginTop: 2 }}>
            {labels.reference} {data.reference}
          </Text>
        ) : null}
      </View>
    </View>
  )
}

export function TireLabelPDF({
  data,
  format,
  copies,
  labels,
  seasonLabel,
}: {
  data: LabelData
  format: LabelFormat
  copies: number
  labels: LabelLabels
  seasonLabel: string
}) {
  const spec = LABEL_SPECS[format]
  const perPage = spec.columns * spec.rows

  if (perPage > 1) {
    const pages = Math.ceil(copies / perPage)
    return (
      <Document>
        {Array.from({ length: pages }, (_, page) => {
          const onThisPage = Math.min(perPage, copies - page * perPage)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: pages are ordinal
            <Page
              key={page}
              size="A4"
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                paddingTop: SHEET_MARGIN.top,
                paddingLeft: SHEET_MARGIN.left,
              }}
            >
              {Array.from({ length: onThisPage }, (_, i) => (
                <View
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells are ordinal
                  key={i}
                  style={{
                    width: spec.width,
                    height: spec.height,
                    borderWidth: 0.25,
                    borderColor: '#dddddd',
                    borderStyle: 'dashed',
                  }}
                >
                  <Label data={data} spec={spec} labels={labels} seasonLabel={seasonLabel} />
                </View>
              ))}
            </Page>
          )
        })}
      </Document>
    )
  }

  // One label per page: a roll printer advances a page per sticker.
  return (
    <Document>
      {Array.from({ length: copies }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: copies are ordinal
        <Page key={i} size={{ width: spec.width, height: spec.height }}>
          <Label data={data} spec={spec} labels={labels} seasonLabel={seasonLabel} />
        </Page>
      ))}
    </Document>
  )
}
