import { Text, View } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'

interface CustomFieldsProps {
  fields: Array<{ label: string; value: string; fieldType: string }>
  styles: Record<string, Style>
  labels?: Record<string, string>
}

function formatFieldValue(value: string, fieldType: string): string {
  if (fieldType === 'checkbox') {
    return value === 'true' || value === '1' ? 'Yes' : 'No'
  }

  if (fieldType === 'date' && value) {
    const date = new Date(value)
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
  }

  return value
}

export function CustomFields({ fields, styles, labels }: CustomFieldsProps) {
  const visibleFields = fields.filter((f) => f.value !== '' && f.value != null)

  if (visibleFields.length === 0) {
    return null
  }

  const title = labels?.customFieldsTitle || 'Additional Information'

  return (
    <View style={styles.infoBox}>
      <Text style={styles.infoLabel}>{title}</Text>
      {visibleFields.map((field, index) => (
        <Text key={index} style={styles.infoTextSmall}>
          {field.label}: {formatFieldValue(field.value, field.fieldType)}
        </Text>
      ))}
    </View>
  )
}
