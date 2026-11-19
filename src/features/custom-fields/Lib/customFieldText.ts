import { DEFAULT_DATE_FORMAT, formatDateForPdf } from '@/lib/format'

/**
 * How a custom field's stored value reads on a document a customer receives:
 * the invoice, the quote, the work order, and the share and portal pages that
 * draw the same sheets.
 *
 * What is stored never changes here. A checkbox holds 'true' or 'false' and
 * prints as the workshop's word for yes or no; a date holds a calendar day
 * (YYYY-MM-DD) and prints in the workshop's date format. Every other type
 * prints exactly what was typed.
 */

export interface CustomFieldTextContext {
  /** The document's labels, already in the workshop's language. */
  labels?: Record<string, string>
  /** The date format the rest of the document prints its dates in. */
  dateFormat?: string
  /** The workshop's zone, for the rare value that carries a time. */
  timezone?: string
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

function isChecked(value: string): boolean {
  return value === 'true' || value === '1'
}

/**
 * A date field's value in the workshop's date format.
 *
 * The form stores a calendar day with no time, so it is printed as that day
 * and never moved through a zone: 2026-03-10 read as UTC midnight is still
 * the 9th in a workshop west of Greenwich. Only a value that names an instant
 * (an ISO timestamp, from an import) is put on the workshop's clock.
 */
function dateText(value: string, ctx: CustomFieldTextContext): string {
  const format = ctx.dateFormat || DEFAULT_DATE_FORMAT
  const day = DATE_ONLY.exec(value.trim())
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])]
    const local = new Date(year, month - 1, date)
    // 2026-02-31 rolls over to March; print what was stored instead.
    if (local.getMonth() !== month - 1 || local.getDate() !== date) return value
    return formatDateForPdf(local, format)
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  // "2026-03-10T23:30:00Z" is an instant; "March 10, 2026" is a wall-clock day
  // the runtime already read in its own zone.
  const isInstant = /T\d{2}:\d{2}/.test(value)
  return formatDateForPdf(parsed, format, isInstant ? ctx.timezone : undefined)
}

export function customFieldText(
  value: string,
  fieldType: string,
  ctx: CustomFieldTextContext = {}
): string {
  if (fieldType === 'checkbox') {
    return isChecked(value)
      ? ctx.labels?.customFieldYes || 'Yes'
      : ctx.labels?.customFieldNo || 'No'
  }
  if (fieldType === 'date' && value) return dateText(value, ctx)
  return value
}

/**
 * The wording every document used before custom fields followed the workshop:
 * English "Yes"/"No" and a US long date. Kept only for invoices issued back
 * then, whose snapshot holds the raw value, so a reprint reads as the sheet
 * the customer was given.
 */
export function legacyCustomFieldText(value: string, fieldType: string): string {
  if (fieldType === 'checkbox') return isChecked(value) ? 'Yes' : 'No'

  if (fieldType === 'date' && value) {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
  }

  return value
}

/** A custom field as a document builder receives it. */
export interface PrintableCustomField {
  fieldId: string
  label: string
  value: string
  fieldType: string
  /** Text settled before the builder ran (an old issued invoice); printed as is. */
  display?: string
}

/** The "Label: value" line a document prints for one custom field. */
export function customFieldLine(field: PrintableCustomField, ctx: CustomFieldTextContext): string {
  const text = field.display ?? customFieldText(field.value, field.fieldType, ctx)
  return `${field.label}: ${text}`
}
