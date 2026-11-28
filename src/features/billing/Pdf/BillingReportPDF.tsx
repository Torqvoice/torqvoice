import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { BillingColumn } from '@/features/billing/Schema/billingListSchema'
import {
  labelSpan,
  type ReportCell,
  type ReportModel,
} from '@/features/billing/Lib/billingReportModel'

/**
 * The billing report as a PDF: A4 landscape, black on white, the letterhead
 * and filters on the first page, the column headings again on every page,
 * a row never split across two, and the page count at the foot.
 */

/** How much of the line each column takes; the title and names get the most. */
const WEIGHT: Record<BillingColumn, number> = {
  invoice: 1.1,
  title: 2.6,
  vehicle: 1.8,
  plate: 0.9,
  customer: 1.9,
  date: 1,
  age: 0.6,
  status: 0.9,
  delivery: 0.9,
  total: 1.15,
  paid: 1.1,
  balance: 1.2,
}

/**
 * A column's share of the line, in percent. Widths rather than flex weights,
 * so a totals label laid over several columns ends exactly where they do and
 * the amounts under it line up with the rows above.
 */
function share(model: ReportModel, column: BillingColumn): number {
  const total = model.headers.reduce((sum, h) => sum + WEIGHT[h.column], 0)
  return (WEIGHT[column] / total) * 100
}

const s = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingHorizontal: 30,
    paddingBottom: 44,
    fontFamily: 'Roboto',
    fontSize: 8,
    color: '#111',
  },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 8,
  },
  brand: { flexDirection: 'row', alignItems: 'center', maxWidth: '60%' },
  logo: { maxWidth: 90, maxHeight: 40, marginRight: 10, objectFit: 'contain' },
  name: { fontSize: 13, fontWeight: 700 },
  muted: { color: '#555' },
  titleBox: { alignItems: 'flex-end', maxWidth: '40%' },
  title: { fontSize: 15, fontWeight: 700, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  chip: {
    borderWidth: 0.75,
    borderColor: '#999',
    borderRadius: 2,
    paddingVertical: 2,
    paddingHorizontal: 5,
    marginRight: 5,
    marginBottom: 4,
  },
  summary: { flexDirection: 'row', marginTop: 4 },
  box: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: '#ccc',
    borderRadius: 2,
    padding: 6,
    marginRight: 6,
  },
  boxStrong: { borderWidth: 1.5, borderColor: '#111' },
  boxValue: { fontSize: 11, fontWeight: 700, marginTop: 2 },
  notice: { marginTop: 6, fontStyle: 'italic' },
  table: { marginTop: 10 },
  headRow: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: '#111',
    paddingBottom: 3,
    backgroundColor: '#fff',
  },
  th: { fontSize: 7, fontWeight: 700, textTransform: 'uppercase', paddingHorizontal: 3 },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
    paddingVertical: 3,
  },
  td: { paddingHorizontal: 3 },
  num: { textAlign: 'right' },
  group: {
    flexDirection: 'row',
    backgroundColor: '#eee',
    paddingVertical: 4,
    paddingHorizontal: 3,
    marginTop: 6,
  },
  groupText: { fontWeight: 700 },
  subtotal: {
    flexDirection: 'row',
    paddingVertical: 3,
    borderBottomWidth: 0.75,
    borderBottomColor: '#999',
  },
  total: {
    flexDirection: 'row',
    borderTopWidth: 1.5,
    borderTopColor: '#111',
    paddingTop: 5,
    marginTop: 2,
  },
  bold: { fontWeight: 700 },
  foot: {
    position: 'absolute',
    left: 30,
    right: 30,
    bottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#666',
    fontSize: 7,
  },
})

function Cells({
  model,
  cells,
  label,
  bold,
}: {
  model: ReportModel
  cells: ReportCell[]
  label?: string
  bold?: boolean
}) {
  const span = label === undefined ? 0 : labelSpan(model)
  const spanWidth = model.headers.slice(0, span).reduce((sum, h) => sum + share(model, h.column), 0)
  return (
    <>
      {span > 0 && (
        <Text style={[s.td, bold ? s.bold : {}, { width: `${spanWidth}%` }]}>{label}</Text>
      )}
      {model.headers.slice(span).map((h, i) => (
        <Text
          key={h.column}
          style={[
            s.td,
            h.numeric ? s.num : {},
            bold ? s.bold : {},
            { width: `${share(model, h.column)}%` },
          ]}
        >
          {cells[i + span]?.text ?? ''}
        </Text>
      ))}
    </>
  )
}

export function BillingReportPDF({ model, pageLabel }: { model: ReportModel; pageLabel: string }) {
  const totalsLine = (label: string, cells: ReportCell[], style: Style, bold: boolean) =>
    labelSpan(model) > 0 ? (
      <View style={style} wrap={false}>
        <Cells model={model} cells={cells} label={label} bold={bold} />
      </View>
    ) : (
      <View wrap={false}>
        <Text style={[s.td, bold ? s.bold : {}, { marginTop: 4 }]}>{label}</Text>
        <View style={style}>
          <Cells model={model} cells={cells} bold={bold} />
        </View>
      </View>
    )

  return (
    <Document title={model.title} author={model.workshopName}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.head}>
          <View style={s.brand}>
            {model.logo && <Image style={s.logo} src={model.logo} />}
            <View>
              <Text style={s.name}>{model.workshopName}</Text>
              {model.workshopLines.map((line) => (
                <Text key={line} style={s.muted}>
                  {line}
                </Text>
              ))}
            </View>
          </View>
          <View style={s.titleBox}>
            <Text style={s.title}>{model.title}</Text>
            <Text style={s.muted}>{model.generated}</Text>
          </View>
        </View>

        <View style={s.chips}>
          {model.chips.map((chip) => (
            <Text key={chip.label} style={s.chip}>
              <Text style={s.bold}>{chip.label}</Text>
              {chip.value ? `: ${chip.value}` : ''}
            </Text>
          ))}
        </View>

        <View style={s.summary}>
          {model.summary.map((item) => (
            <View key={item.label} style={item.emphasis ? [s.box, s.boxStrong] : s.box}>
              <Text>{item.label}</Text>
              <Text style={s.boxValue}>{item.value}</Text>
            </View>
          ))}
        </View>
        {model.notice && <Text style={s.notice}>{model.notice}</Text>}

        <View style={s.table}>
          <View style={s.headRow} fixed>
            {model.headers.map((h) => (
              <Text
                key={h.column}
                style={[s.th, h.numeric ? s.num : {}, { width: `${share(model, h.column)}%` }]}
              >
                {h.label}
              </Text>
            ))}
          </View>
          {model.sections.map((section, index) => (
            <View key={section.heading ?? index}>
              {section.heading && (
                <View style={s.group} wrap={false} minPresenceAhead={24}>
                  <Text style={s.groupText}>{section.heading}</Text>
                </View>
              )}
              {section.rows.map((cells, rowIndex) => (
                <View key={rowIndex} style={s.row} wrap={false}>
                  <Cells model={model} cells={cells} />
                </View>
              ))}
              {section.subtotal &&
                totalsLine(section.label ?? '', section.subtotal, s.subtotal, false)}
            </View>
          ))}
          {totalsLine(model.totalLabel, model.total, s.total, true)}
        </View>

        <View style={s.foot} fixed>
          <Text>{model.footer}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              pageLabel.replace('{page}', String(pageNumber)).replace('{pages}', String(totalPages))
            }
          />
        </View>
      </Page>
    </Document>
  )
}
