import { useTranslations } from 'next-intl'
import { statusMessageKeys } from '../Components/service-detail/types'

/**
 * Status keys under service.basicInfo.statusOptions, by stored value. A
 * booking stores `scheduled`, and older demo data still has `in_progress`
 * from before the values were hyphenated.
 */
const STATUS_KEYS: Record<string, string> = {
  ...statusMessageKeys,
  scheduled: 'scheduled',
  in_progress: 'in_progress',
  waiting_parts: 'waiting_parts',
}

const TYPES = new Set(['maintenance', 'repair', 'upgrade', 'inspection'])

/**
 * A work order's status and type as the reader's language says them.
 *
 * Lists printed the stored value ("in-progress", "maintenance") in English
 * whatever the language, while the work order itself said "In Progress". A
 * value with no label yet, such as a type added later, prints as stored
 * rather than as a missing message.
 */
export function useServiceLabels() {
  const t = useTranslations('service.basicInfo')
  return {
    status: (value: string) =>
      STATUS_KEYS[value] ? t(`statusOptions.${STATUS_KEYS[value]}`) : value,
    type: (value: string) => (TYPES.has(value) ? t(`typeOptions.${value}`) : value),
  }
}
