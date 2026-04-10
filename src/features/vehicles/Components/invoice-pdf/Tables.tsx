import { Text, View } from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/format'
import { netLineTotal } from '@/lib/tax'
import { getFontBold } from './styles'
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

  // Universal display: when an inclusive record is rendered, line item prices
  // are back-calculated to net so the invoice is legally compliant and clear.
  // Exclusive records render unchanged (netLineTotal returns input as-is).
  const taxRate = data.taxRate
  const taxInclusive = data.taxInclusive ?? false

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
        {data.partItems.map((part, i) => {
          const netUnitPrice = netLineTotal(part.unitPrice, taxRate, taxInclusive)
          const netLineTotalValue = netLineTotal(part.total, taxRate, taxInclusive)
          return (
            <View key={i} style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, width: '15%' }}>{part.partNumber || '-'}</Text>
              <Text style={{ ...styles.tableCell, width: '35%' }}>{part.name}</Text>
              <Text style={{ ...styles.tableCell, width: '12%', textAlign: 'right' }}>
                {part.quantity}
              </Text>
              <Text style={{ ...styles.tableCell, width: '18%', textAlign: 'right' }}>
                {formatCurrency(netUnitPrice, currencyCode)}
              </Text>
              <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
                {formatCurrency(netLineTotalValue, currencyCode)}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function LaborTable({ data, currencyCode, styles, labels }: TablesProps) {
  if (data.laborItems.length === 0) return null

  // See PartsTable for the rationale on netLineTotal usage.
  const taxRate = data.taxRate
  const taxInclusive = data.taxInclusive ?? false

  return (
    <View>
      <Text style={styles.sectionTitle}>{labels.labor || 'Labor'}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>{labels.description || 'Description'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '15%', textAlign: 'right' }}>{labels.qtyOrHours || labels.hours || 'Qty / Hours'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>{labels.rate || 'Rate'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '20%', textAlign: 'right' }}>{labels.total || 'Total'}</Text>
        </View>
        {data.laborItems.map((labor, i) => {
          const isService = labor.pricingType === 'service'
          const netRate = netLineTotal(labor.rate, taxRate, taxInclusive)
          const netLineTotalValue = netLineTotal(labor.total, taxRate, taxInclusive)
          return (
            <View key={i} style={styles.tableRow}>
              <Text style={{ ...styles.tableCell, width: '45%' }}>{labor.description}</Text>
              <Text style={{ ...styles.tableCell, width: '15%', textAlign: 'right' }}>
                {isService
                  ? `${labor.hours} ${labels.unit || 'unit'}`
                  : `${labor.hours} ${labels.hrs || 'hrs'}`}
              </Text>
              <Text style={{ ...styles.tableCell, width: '20%', textAlign: 'right' }}>
                {isService
                  ? formatCurrency(netRate, currencyCode)
                  : labels.ratePerHour
                    ? fillTemplate(labels.ratePerHour, { rate: formatCurrency(netRate, currencyCode) })
                    : `${formatCurrency(netRate, currencyCode)}/hr`}
              </Text>
              <Text style={{ ...styles.tableCellBold, width: '20%', textAlign: 'right' }}>
                {formatCurrency(netLineTotalValue, currencyCode)}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

export function FindingsPdfSection({
  findings,
  fontFamily,
  styles,
  labels,
}: {
  findings: Array<{ description: string; severity: string; notes: string | null }>
  fontFamily: string
  styles: Record<string, Style>
  labels: Record<string, string>
}) {
  if (!findings || findings.length === 0) return null
  const fontBold = getFontBold(fontFamily)

  const severityLabels: Record<string, string> = {
    urgent: labels.findingSeverityUrgent || 'Urgent',
    needs_work: labels.findingSeverityNeedsWork || 'Needs Work',
    monitor: labels.findingSeverityMonitor || 'Monitor',
  }

  const severityColors: Record<string, string> = {
    urgent: '#ef4444',
    needs_work: '#f59e0b',
    monitor: '#3b82f6',
  }

  return (
    <View>
      <Text style={styles.sectionTitle}>{labels.findings || 'Findings'}</Text>
      <Text style={{ fontSize: 8, color: '#666', marginBottom: 4, lineHeight: 1.4 }}>{labels.findingsDescription || 'The following items were observed during this service and may require attention.'}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={{ ...styles.tableHeaderCell, width: '15%' }}>{labels.findingSeverityLabel || 'Severity'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '40%' }}>{labels.description || 'Description'}</Text>
          <Text style={{ ...styles.tableHeaderCell, width: '45%' }}>{labels.findingNotesLabel || 'Notes'}</Text>
        </View>
        {findings.map((f, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={{
              ...styles.tableCell,
              width: '15%',
              fontSize: 8,
              color: severityColors[f.severity] || '#666',
              fontFamily: fontBold,
              textTransform: 'uppercase',
            }}>
              {severityLabels[f.severity] || f.severity}
            </Text>
            <Text style={{ ...styles.tableCell, width: '40%' }}>{f.description}</Text>
            <Text style={{ ...styles.tableCell, width: '45%', color: '#666' }}>{f.notes || '-'}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
