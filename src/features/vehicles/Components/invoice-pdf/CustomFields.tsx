/**
 * How a custom field's stored value reads on paper. The panels themselves are
 * drawn by the document model; this stays because the mappers still need to
 * turn a checkbox into a word and a date into a date.
 */
export function formatFieldValue(value: string, fieldType: string): string {
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
