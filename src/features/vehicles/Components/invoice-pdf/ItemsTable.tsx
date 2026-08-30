import { Text, View } from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/format'
import { netLineTotal } from '@/lib/tax'
import { inkColors } from './styles'
import type { Style } from '@react-pdf/types'

/**
 * One row of the combined table, flattened from whatever the document calls its
 * parts and labor lines. Both documents map their own rows into this shape, so
 * the table itself never has to know which is which.
 */
export interface CombinedItem {
  quantity: number
  /** Unit of measure. Labor lines pass their own ("hrs", "unit"). */
  unit?: string | null
  description: string
  /** Part number, printed under the description when there is one. */
  reference?: string | null
  unitPrice: number
  total: number
  /** Quote lines the customer has opted out of. */
  excluded?: boolean
}

const COLUMNS = {
  pos: '6%',
  qty: '10%',
  unit: '11%',
  description: '43%',
  unitPrice: '15%',
  total: '15%',
} as const

/**
 * Every line on one numbered list, the way a workshop that bills a job as a
 * sequence of positions expects to see it, rather than split across a parts
 * table and a labor table.
 */
export function ItemsTable({
  items,
  currencyCode,
  currencyFormat = 'symbol',
  taxRate,
  taxInclusive = false,
  showTitle = true,
  styles,
  labels,
}: {
  items: CombinedItem[]
  currencyCode: string
  currencyFormat?: 'symbol' | 'code'
  taxRate: number
  taxInclusive?: boolean
  /** Off where the column headings alone are enough, as on a framed sheet. */
  showTitle?: boolean
  styles: Record<string, Style>
  labels: Record<string, string>
}) {
  if (items.length === 0) return null

  const { muted } = inkColors(styles)

  return (
    <View>
      {showTitle ? <Text style={styles.sectionTitle}>{labels.items || 'Items'}</Text> : null}
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: COLUMNS.pos }}>{labels.pos || '#'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: COLUMNS.qty, textAlign: 'right' }}>
            {labels.qty || 'Qty'}
          </Text>
          <Text style={{ ...styles.tableHeaderCell, width: COLUMNS.unit, paddingLeft: 6 }}>
            {labels.unitOfMeasure || 'Unit'}
          </Text>
          <Text style={{ ...styles.tableHeaderCell, width: COLUMNS.description }}>
            {labels.description || 'Description'}
          </Text>
          <Text style={{ ...styles.tableHeaderCell, width: COLUMNS.unitPrice, textAlign: 'right' }}>
            {labels.unitPrice || 'Unit Price'}
          </Text>
          <Text style={{ ...styles.tableHeaderCell, width: COLUMNS.total, textAlign: 'right' }}>
            {labels.total || 'Total'}
          </Text>
        </View>

        {items.map((item, i) => {
          // Inclusive records are back-calculated to net so the line prices on
          // the page still add up to the net subtotal below them, exactly as
          // the separate parts and labor tables already do.
          const netUnitPrice = netLineTotal(item.unitPrice, taxRate, taxInclusive)
          const netTotal = netLineTotal(item.total, taxRate, taxInclusive)
          const struck = item.excluded ? { textDecoration: 'line-through' as const } : {}

          return (
            <View
              key={i}
              style={{
                ...styles.tableRow,
                // An empty alt style is how the layout turns banding off.
                ...(i % 2 === 1 ? styles.tableRowAlt || {} : {}),
                ...(item.excluded ? { opacity: 0.5 } : {}),
              }}
            >
              <Text style={{ ...styles.tableCell, width: COLUMNS.pos, color: muted }}>{i + 1}</Text>
              <Text
                style={{ ...styles.tableCell, width: COLUMNS.qty, textAlign: 'right', ...struck }}
              >
                {item.quantity}
              </Text>
              <Text
                style={{ ...styles.tableCell, width: COLUMNS.unit, paddingLeft: 6, color: muted }}
              >
                {item.unit || ''}
              </Text>
              <View style={{ width: COLUMNS.description }}>
                <Text style={{ ...styles.tableCell, ...struck }}>{item.description}</Text>
                {item.reference ? (
                  <Text style={{ ...styles.tableCell, fontSize: 7.5, color: muted }}>
                    {item.reference}
                  </Text>
                ) : null}
              </View>
              <Text
                style={{
                  ...styles.tableCell,
                  width: COLUMNS.unitPrice,
                  textAlign: 'right',
                  ...struck,
                }}
              >
                {formatCurrency(netUnitPrice, currencyCode, currencyFormat)}
              </Text>
              <Text
                style={{
                  ...styles.tableCellBold,
                  width: COLUMNS.total,
                  textAlign: 'right',
                  ...struck,
                }}
              >
                {formatCurrency(netTotal, currencyCode, currencyFormat)}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}
