import {
  EMPTY_WARRANTY,
  isWarrantyStatement,
  normalizeWarranty,
  type WarrantyFields,
  type WarrantyStatement,
  type WarrantyTexts,
} from '@/lib/warranty'
import { shiftWorkshopTime } from '@/lib/workshop-datetime'
import { SETTING_KEYS } from '../Schema/settingsSchema'

/**
 * The workshop's standing answer on warranty, read in one place.
 *
 * A workshop writes its terms once (Settings, Warranty) and every new quote
 * and work order starts from them, the way a new document starts from the
 * workshop's tax. The document then owns its copy: changing the setting later
 * never rewrites a quote a customer already holds.
 */

export const WARRANTY_SETTING_KEYS = [
  SETTING_KEYS.WARRANTY_DEFAULT_STATUS,
  SETTING_KEYS.WARRANTY_DEFAULT_MONTHS,
  SETTING_KEYS.WARRANTY_DEFAULT_MILEAGE,
  SETTING_KEYS.WARRANTY_DEFAULT_TERMS,
  SETTING_KEYS.WARRANTY_NOT_INCLUDED_TEXT,
  SETTING_KEYS.WARRANTY_APPLY_TO_QUOTES,
  SETTING_KEYS.WARRANTY_APPLY_TO_WORK_ORDERS,
] as const

export type WarrantyDocumentKind = 'quote' | 'workOrder'

export interface WarrantyDefaults extends WarrantyTexts {
  /** What a new document says, or null when it says nothing until somebody chooses. */
  status: WarrantyStatement | null
  applyToQuotes: boolean
  applyToWorkOrders: boolean
}

function positiveInt(value: string | undefined): number | null {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function readWarrantyDefaults(
  settings: Record<string, string | undefined>
): WarrantyDefaults {
  const status = settings[SETTING_KEYS.WARRANTY_DEFAULT_STATUS]
  return {
    status: isWarrantyStatement(status) ? status : null,
    defaultMonths: positiveInt(settings[SETTING_KEYS.WARRANTY_DEFAULT_MONTHS]),
    defaultMileage: positiveInt(settings[SETTING_KEYS.WARRANTY_DEFAULT_MILEAGE]),
    includedTerms: settings[SETTING_KEYS.WARRANTY_DEFAULT_TERMS]?.trim() ?? '',
    notIncludedText: settings[SETTING_KEYS.WARRANTY_NOT_INCLUDED_TEXT]?.trim() ?? '',
    applyToQuotes: settings[SETTING_KEYS.WARRANTY_APPLY_TO_QUOTES] !== 'false',
    applyToWorkOrders: settings[SETTING_KEYS.WARRANTY_APPLY_TO_WORK_ORDERS] !== 'false',
  }
}

/** The texts alone, for an editor that fills them in when the statement changes. */
export function warrantyTextsOf(defaults: WarrantyDefaults): WarrantyTexts {
  return {
    includedTerms: defaults.includedTerms,
    notIncludedText: defaults.notIncludedText,
    defaultMonths: defaults.defaultMonths,
    defaultMileage: defaults.defaultMileage,
  }
}

/** The warranty a new document of this kind starts with. */
export function warrantyFieldsForNewDocument(
  defaults: WarrantyDefaults,
  kind: WarrantyDocumentKind
): WarrantyFields {
  const applies = kind === 'quote' ? defaults.applyToQuotes : defaults.applyToWorkOrders
  if (!applies || !defaults.status) return EMPTY_WARRANTY
  return normalizeWarranty({
    warrantyStatus: defaults.status,
    warrantyMonths: defaults.defaultMonths,
    warrantyMileage: defaults.defaultMileage,
    warrantyNotes:
      defaults.status === 'included' ? defaults.includedTerms : defaults.notIncludedText,
  })
}

/**
 * When an included warranty runs out: the months counted from the day of the
 * work, on the workshop's calendar. Null for anything that is not a period.
 */
export function warrantyExpiryFor(
  fields: WarrantyFields,
  serviceDate: Date,
  timeZone: string
): Date | null {
  if (fields.warrantyStatus !== 'included' || !fields.warrantyMonths) return null
  return shiftWorkshopTime(serviceDate, { months: fields.warrantyMonths }, timeZone)
}
