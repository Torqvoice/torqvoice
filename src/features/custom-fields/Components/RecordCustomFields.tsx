'use client'

import { useTranslations } from 'next-intl'
import { useDateSettings } from '@/components/date-settings-context'
import { customFieldText } from '@/features/custom-fields/Lib/customFieldText'
import { cn } from '@/lib/utils'

/** One of a vehicle's or a customer's own fields, as its page is handed it. */
export interface RecordCustomField {
  fieldId: string
  label: string
  value: string
  fieldType: string
}

/**
 * The fields as a page reads them out: a tick as yes or no, a date in the
 * workshop's format, everything else as typed. Fields without a value are
 * already left out by the read.
 */
export function useRecordCustomFieldRows(
  fields: RecordCustomField[] | undefined
): { id: string; label: string; text: string }[] {
  const t = useTranslations('settings.customFields')
  const { dateFormat, timezone } = useDateSettings()
  return (fields ?? []).map((field) => ({
    id: field.fieldId,
    label: field.label,
    text: customFieldText(field.value, field.fieldType, {
      labels: { customFieldYes: t('valueYes'), customFieldNo: t('valueNo') },
      dateFormat,
      timezone: timezone || undefined,
    }),
  }))
}

/**
 * A vehicle's or a customer's own fields, read-only, under what the page
 * already says about it. Draws nothing for a record without any, which is
 * every record of a workshop that has defined none.
 */
export function RecordCustomFields({
  fields,
  className,
}: {
  fields: RecordCustomField[] | undefined
  className?: string
}) {
  const rows = useRecordCustomFieldRows(fields)
  if (rows.length === 0) return null
  return (
    <dl
      data-testid="record-custom-fields"
      className={cn('flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground', className)}
    >
      {rows.map((row) => (
        <div key={row.id} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0">{row.label}:</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words text-foreground">{row.text}</dd>
        </div>
      ))}
    </dl>
  )
}
