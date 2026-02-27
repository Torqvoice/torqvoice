import { Text, View } from '@react-pdf/renderer'
import { formatCurrency } from '@/lib/format'
import type { InvoiceData, PaymentSummary } from './types'
import { gray, lightenColor, getFontBold } from './styles'
import type { Style } from '@react-pdf/types'

function fillTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (str, [key, val]) => str.replace(`{${key}}`, val),
    template
  )
}

interface TotalsProps {
  data: InvoiceData
  currencyCode: string
  primaryColor: string
  fontFamily: string
  displayTotal: number
  partsSubtotal: number
  laborSubtotal: number
  balanceDue: number
  isPaidInFull: boolean
  paymentSummary?: PaymentSummary
  styles: Record<string, Style>
  labels: Record<string, string>
}

export function Totals({
  data,
  currencyCode,
  primaryColor,
  fontFamily,
  displayTotal,
  partsSubtotal,
  laborSubtotal,
  balanceDue,
  isPaidInFull,
  paymentSummary,
  styles,
  labels,
}: TotalsProps) {
  const fontBold = getFontBold(fontFamily)

  return (
    <View style={styles.totalsBox}>
      {data.partItems.length > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.parts || 'Parts'}</Text>
          <Text style={styles.totalValue}>{formatCurrency(partsSubtotal, currencyCode)}</Text>
        </View>
      )}
      {data.laborItems.length > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.labor || 'Labor'}</Text>
          <Text style={styles.totalValue}>{formatCurrency(laborSubtotal, currencyCode)}</Text>
        </View>
      )}
      {data.subtotal > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.subtotal || 'Subtotal'}</Text>
          <Text style={styles.totalValue}>{formatCurrency(data.subtotal, currencyCode)}</Text>
        </View>
      )}
      {(data.discountAmount ?? 0) > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {data.discountType === 'percentage'
              ? (labels.discountPercent ? fillTemplate(labels.discountPercent, { percent: String(data.discountValue) }) : `Discount (${data.discountValue}%)`)
              : (labels.discount || 'Discount')}
          </Text>
          <Text style={{ ...styles.totalValue, color: '#dc2626' }}>
            {formatCurrency(-(data.discountAmount ?? 0), currencyCode)}
          </Text>
        </View>
      )}
      {data.taxRate > 0 && (
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{labels.tax ? fillTemplate(labels.tax, { rate: String(data.taxRate) }) : `Tax (${data.taxRate}%)`}</Text>
          <Text style={styles.totalValue}>{formatCurrency(data.taxAmount, currencyCode)}</Text>
        </View>
      )}
      <View style={styles.totalDivider} />
      {paymentSummary && paymentSummary.payments.length > 0 ? (
        <>
          <View style={styles.totalRow}>
            <Text style={{ fontSize: 10, fontFamily: fontBold }}>{labels.total || 'Total'}</Text>
            <Text style={{ fontSize: 10, fontFamily: fontBold }}>
              {formatCurrency(displayTotal, currencyCode)}
            </Text>
          </View>
          <View style={{ ...styles.totalDivider, marginVertical: 6 }} />
          <Text style={{ fontSize: 9, fontFamily: fontBold, marginBottom: 4 }}>
            {labels.paymentsReceived || 'Payments Received'}
          </Text>
          {paymentSummary.payments.map((p, i) => (
            <View key={i} style={styles.totalRow}>
              <Text style={{ fontSize: 8, color: gray }}>
                {p.date} ({p.method})
              </Text>
              <Text style={{ fontSize: 9, color: '#059669' }}>
                {formatCurrency(-p.amount, currencyCode)}
              </Text>
            </View>
          ))}
          <View
            style={{ borderTopWidth: 2, borderTopColor: primaryColor, marginVertical: 6 }}
          />
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingVertical: 6,
              backgroundColor: isPaidInFull ? '#f0fdf4' : lightenColor(primaryColor, 0.92),
              marginHorizontal: -8,
              paddingHorizontal: 8,
              borderRadius: 3,
            }}
          >
            <Text style={{ fontSize: 16, fontFamily: fontBold }}>
              {isPaidInFull ? (labels.paidInFull || 'PAID IN FULL') : (labels.amountDue || 'Amount Due')}
            </Text>
            <Text
              style={{
                fontSize: 16,
                fontFamily: fontBold,
                color: isPaidInFull ? '#059669' : primaryColor,
              }}
            >
              {isPaidInFull ? '' : formatCurrency(balanceDue, currencyCode)}
            </Text>
          </View>
        </>
      ) : (
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>{labels.total || 'Total'}</Text>
          <Text style={styles.grandTotalValue}>{formatCurrency(displayTotal, currencyCode)}</Text>
        </View>
      )}
    </View>
  )
}
