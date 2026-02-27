import { Text, View } from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/format'
import type { InvoiceData } from './types'
import type { Style } from '@react-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface TablesProps {
  data: InvoiceData
  currencyCode: string
  styles: Record<string, Style>
  labels: Record<string, string>
}

export function PartsTable({ data, currencyCode, styles, labels }: TablesProps) {
  if (data.partItems.length === 0) return null

  return (
    <View>
      <Text style={styles.sectionTitle}>{labels.parts || 'Parts'}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '15%' }}>{labels.partNumber || 'Part #'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '35%' }}>{labels.description || 'Description'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '12%', textAlign: 'right' }}>{labels.qty || 'Qty'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '18%', textAlign: 'right' }}>
            {labels.unitPrice || 'Unit Price'}
          </Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>{labels.total || 'Total'}</Text>
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

export function LaborTable({ data, currencyCode, styles, labels }: TablesProps) {
  if (data.laborItems.length === 0) return null

  return (
    <View>
      <Text style={styles.sectionTitle}>{labels.labor || 'Labor'}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>{labels.description || 'Description'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '15%', textAlign: 'right' }}>{labels.hours || 'Hours'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>{labels.rate || 'Rate'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>{labels.total || 'Total'}</Text>
        </View>
        {data.laborItems.map((labor, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={{ ...styles.tableCell, width: '45%' }}>{labor.description}</Text>
            <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right' }}>
              {labor.hours}
            </Text>
            <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right' }}>
              {labels.ratePerHour ? fillTemplate(labels.ratePerHour, { rate: formatCurrency(labor.rate, currencyCode) }) : `${formatCurrency(labor.rate, currencyCode)}/hr`}
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
