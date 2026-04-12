import { Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import { getFontBold } from './styles'
import { formatDateForPdf, DEFAULT_DATE_FORMAT } from '@/lib/format'

interface WarrantyProps {
  warrantyMonths: number | null | undefined
  warrantyMileage: number | null | undefined
  warrantyExpiresAt: Date | string | null | undefined
  warrantyNotes: string | null | undefined
  fontFamily: string
  styles: Record<string, Style>
  labels: Record<string, string>
  dateFormat?: string
  timezone?: string
}

export function WarrantySection({
  warrantyMonths,
  warrantyMileage,
  warrantyExpiresAt,
  warrantyNotes,
  fontFamily,
  styles,
  labels,
  dateFormat,
  timezone,
}: WarrantyProps) {
  // Only render if there is warranty data
  if (!warrantyMonths && !warrantyNotes) return null

  const fontBold = getFontBold(fontFamily)

  // Build the duration/mileage line, e.g. "12 months / 20,000 km"
  const parts: string[] = []
  if (warrantyMonths) {
    parts.push(
      `${warrantyMonths} ${labels.warrantyMonthsUnit || (warrantyMonths === 1 ? 'month' : 'months')}`
    )
  }
  if (warrantyMileage) {
    parts.push(`${warrantyMileage.toLocaleString()} ${labels.km || 'km'}`)
  }
  const durationLine = parts.length > 0 ? parts.join(' / ') : null

  // Format the expiry date
  let expiresLine: string | null = null
  if (warrantyExpiresAt) {
    const formatted = formatDateForPdf(warrantyExpiresAt, dateFormat || DEFAULT_DATE_FORMAT, timezone)
    expiresLine = `${labels.warrantyExpires || 'Expires'}: ${formatted}`
  }

  return (
    <View wrap={false} style={styles.notesSection}>
      <Text style={styles.notesLabel}>
        {labels.warrantyTitle || 'Warranty'}
      </Text>

      {durationLine && (
        <View style={{ flexDirection: 'row', marginBottom: 2 }}>
          <Text style={{ fontSize: 9, fontFamily: fontBold }}>
            {labels.warrantyDuration || 'Duration'}:{' '}
          </Text>
          <Text style={{ fontSize: 9, color: '#6b7280' }}>{durationLine}</Text>
        </View>
      )}

      {expiresLine && (
        <Text style={{ fontSize: 9, color: '#6b7280', marginBottom: 2 }}>
          {expiresLine}
        </Text>
      )}

      {warrantyNotes && (
        <View style={{ marginTop: 2 }}>
          <Text style={{ fontSize: 8, fontFamily: fontBold, color: '#6b7280', marginBottom: 1 }}>
            {labels.warrantyNotes || 'Terms'}
          </Text>
          <Text style={{ fontSize: 9, color: '#6b7280', lineHeight: 1.5 }}>
            {warrantyNotes}
          </Text>
        </View>
      )}
    </View>
  )
}
