import { normalizeWarranty } from '@/lib/warranty'
import type { DocumentData } from '../Spec/buildSpec'

/**
 * The warranty panel's words, for an invoice and a quote alike.
 *
 * One builder so the two documents cannot drift: a customer who accepted a
 * quote saying "12 months / 20,000 km" has to find the same line on the
 * invoice. The row is read through normalizeWarranty, so a job saved before
 * the statement existed (months, no status) still prints as the included
 * warranty it was.
 */
export function warrantyForPrint(
  row: {
    warrantyStatus?: string | null
    warrantyMonths?: number | null
    warrantyMileage?: number | null
    warrantyNotes?: string | null
  },
  opts: {
    labels: Record<string, string>
    /** 'metric' prints km; anything else prints miles, as the vehicle's mileage does. */
    unitSystem?: string
    /** The expiry, already formatted; a quote has none. */
    expires?: string
  }
): DocumentData['warranty'] {
  const { labels } = opts
  const warranty = normalizeWarranty(row)
  if (!warranty.warrantyStatus) return {}

  if (warranty.warrantyStatus === 'not_included') {
    return {
      statement: labels.warrantyNotIncluded || 'No workshop warranty is included',
      // The workshop's own sentence when it wrote one. Otherwise the one thing
      // that must not be left unsaid: declining a commercial warranty takes
      // nothing away from what the law gives the customer.
      terms:
        warranty.warrantyNotes ??
        (labels.warrantyStatutoryRights || 'Your statutory rights are not affected.'),
    }
  }

  const parts: string[] = []
  if (warranty.warrantyMonths) {
    const unit = labels.warrantyMonthsUnit || (warranty.warrantyMonths === 1 ? 'month' : 'months')
    parts.push(`${warranty.warrantyMonths} ${unit}`)
  }
  if (warranty.warrantyMileage) {
    const unit = opts.unitSystem === 'metric' ? labels.km || 'km' : labels.mi || 'mi'
    parts.push(`${warranty.warrantyMileage.toLocaleString()} ${unit}`)
  }

  const duration = parts.length ? parts.join(' / ') : undefined
  const terms = warranty.warrantyNotes ?? undefined
  return {
    duration,
    expires: duration ? opts.expires : undefined,
    terms,
    // "Included" on its own, for a workshop that states the fact and keeps
    // the detail for the conversation.
    statement: !duration && !terms ? labels.warrantyIncluded || 'Included' : undefined,
  }
}
