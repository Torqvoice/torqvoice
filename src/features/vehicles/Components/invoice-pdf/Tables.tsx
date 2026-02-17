import { Text, View } from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/format'
import type { InvoiceData } from './types'
import type { Style } from '@react-pdf/types'

interface TablesProps {
  data: InvoiceData
  currencyCode: string
  styles: Record<string, Style>
}

export function PartsTable({ data, currencyCode, styles }: TablesProps) {
  if (data.partItems.length === 0) return null

  return (
    <View>
      <Text style={styles.sectionTitle}>Parts</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '15%' }}>Part #</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>Description</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '12%', textAlign: 'right' }}>Qty</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '18%', textAlign: 'right' }}>
            Unit Price
          </Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>Total</Text>
        </View>
        {data.partItems.map((part, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, width: '15%' }}>{part.partNumber || '-'}</Text>
            <Text style={{ ...styles.tableCell, width: '35%' }}>{part.name}</Text>
            <Text style={{ ...styles.tableCell, width: '12%', textAlign: 'right' }}>
              {part.quantity}
            </Text>
            <Text style={{ ...styles.tableCell, width: '18%', textAlign: 'right' }}>
              {formatCurrency(part.unitPrice, currencyCode)}
            </Text>
            <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
              {formatCurrency(part.total, currencyCode)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

export function LaborTable({ data, currencyCode, styles }: TablesProps) {
  if (data.laborItems.length === 0) return null

  return (
    <View>
      <Text style={styles.sectionTitle}>Labor</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>Description</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '15%', textAlign: 'right' }}>Hours</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>Rate</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>Total</Text>
        </View>
        {data.laborItems.map((labor, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, width: '45%' }}>{labor.description}</Text>
            <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right' }}>
              {labor.hours}
            </Text>
            <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right' }}>
              {formatCurrency(labor.rate, currencyCode)}/hr
            </Text>
            <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
              {formatCurrency(labor.total, currencyCode)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}
