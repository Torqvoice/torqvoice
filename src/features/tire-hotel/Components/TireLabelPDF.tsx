import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import {
  A4,
  LABEL_SPECS,
  SHEET_MARGIN,
  type LabelData,
  type LabelFormat,
  type LabelSpec,
} from '../Lib/labels'

/**
 * The sticker that goes on a tire.
 *
 * Read at arm's length in a cold store by someone holding a wheel, so the
 * plate is the largest thing on it and everything else is support. The QR is
 * sized to scan from a phone held roughly a hand's width away, which on the
 * small format means it takes nearly half the label.
 */

const styles = StyleSheet.create({
  label: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    padding: 6,
  },
  qrBlock: {
    alignItems: 'center',
    marginRight: 6,
  },
  qrCaption: {
    fontSize: 4,
    color: '#666666',
    marginTop: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  plate: {
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  plateSmall: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  line: {
    fontSize: 7,
    color: '#333333',
    marginTop: 1,
  },
  muted: {
    fontSize: 6,
    color: '#777777',
    marginTop: 1,
  },
  reference: {
    fontSize: 8,
    fontWeight: 'bold',
    marginTop: 2,
  },
  flags: {
    flexDirection: 'row',
    marginTop: 2,
  },
  flag: {
    fontSize: 5.5,
    color: '#000000',
    borderWidth: 0.5,
    borderColor: '#999999',
    borderRadius: 2,
    paddingHorizontal: 2,
    paddingVertical: 0.5,
    marginRight: 2,
  },
  // Large format stacks instead, since the roll is taller than it is wide.
  tall: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: 8,
  },
  tallPlate: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  tallLine: {
    fontSize: 9,
    color: '#333333',
    marginTop: 3,
    textAlign: 'center',
  },
  sheetPage: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: SHEET_MARGIN.top,
    paddingLeft: SHEET_MARGIN.left,
  },
  cell: {
    borderWidth: 0.25,
    borderColor: '#dddddd',
    borderStyle: 'dashed',
  },
})

function seasonLine(data: LabelData, seasonLabel: string): string {
  return [data.brand, data.size, seasonLabel].filter(Boolean).join(' · ')
}

function Flags({ data, labels }: { data: LabelData; labels: LabelLabels }) {
  const flags = [
    data.withRims ? labels.withRims : null,
    data.hasTpms ? labels.tpms : null,
    data.studded ? labels.studded : null,
  ].filter(Boolean) as string[]
  if (flags.length === 0) return null
  return (
    <View style={styles.flags}>
      {flags.map((flag) => (
        <Text key={flag} style={styles.flag}>
          {flag}
        </Text>
      ))}
    </View>
  )
}

/** One sticker, laid out for the space it has. */
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
  const identity = data.plate || data.customer || data.reference || labels.unassigned

  if (spec.detail === 'full') {
    // Tall roll: the QR gets its own row rather than competing for width.
    return (
      <View style={styles.tall}>
        <Image src={data.qr} style={{ width: 110, height: 110 }} />
        <Text style={styles.qrCaption}>{data.url}</Text>
        <Text style={styles.tallPlate}>{identity}</Text>
        {data.customer && data.plate && <Text style={styles.tallLine}>{data.customer}</Text>}
        <Text style={styles.tallLine}>{seasonLine(data, seasonLabel)}</Text>
        <Text style={styles.tallLine}>
          {labels.quantity.replace('{count}', String(data.quantity))}
        </Text>
        <Flags data={data} labels={labels} />
        {data.reference && (
          <Text style={styles.reference}>
            {labels.reference} {data.reference}
          </Text>
        )}
        <Text style={styles.muted}>{data.shopName}</Text>
      </View>
    )
  }

  const qrSize = spec.detail === 'minimal' ? 52 : 62

  return (
    <View style={styles.label}>
      <View style={styles.qrBlock}>
        <Image src={data.qr} style={{ width: qrSize, height: qrSize }} />
      </View>
      <View style={styles.body}>
        <Text style={spec.detail === 'minimal' ? styles.plateSmall : styles.plate}>{identity}</Text>

        {/* On the smallest label everything below the plate competes with it,
            so only the reference survives. */}
        {spec.detail === 'minimal' ? (
          data.reference ? (
            <Text style={styles.reference}>
              {labels.reference} {data.reference}
            </Text>
          ) : null
        ) : (
          <>
            {data.customer && data.plate && <Text style={styles.line}>{data.customer}</Text>}
            <Text style={styles.line}>{seasonLine(data, seasonLabel)}</Text>
            <Flags data={data} labels={labels} />
            <Text style={styles.muted}>
              {data.reference ? `${labels.reference} ${data.reference} · ` : ''}
              {data.shopName}
            </Text>
          </>
        )}
      </View>
    </View>
  )
}

export type LabelLabels = {
  reference: string
  quantity: string
  withRims: string
  tpms: string
  studded: string
  unassigned: string
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
  const sheets = spec.columns * spec.rows > 1

  if (sheets) {
    const per = spec.columns * spec.rows
    const pages = Math.ceil(copies / per)
    return (
      <Document>
        {Array.from({ length: pages }, (_, page) => {
          const onThisPage = Math.min(per, copies - page * per)
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: pages are ordinal
            <Page key={page} size="A4" style={styles.sheetPage}>
              {Array.from({ length: onThisPage }, (_, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells are ordinal
                <View key={i} style={[styles.cell, { width: spec.width, height: spec.height }]}>
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

export { A4 }
