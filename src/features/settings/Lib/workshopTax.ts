import { calculateTotals, type TaxComponentDefinition } from '@/lib/tax'
import {
  parseTaxComponentDefinitions,
  parseTaxComponents,
  type StoredTaxComponent,
  taxComponentsJson,
} from '@/lib/tax-components'
import { SETTING_KEYS } from '../Schema/settingsSchema'

/**
 * The workshop's tax as settings describe it, read in one place.
 *
 * Every path that opens a new document (a work order, a quote, a tire job,
 * a recurring template) used to read the three tax keys for itself. With
 * components in the picture that is one more thing to forget, so the keys
 * are listed here and read here, and a new document asks for its tax fields
 * rather than assembling them.
 */

export const WORKSHOP_TAX_SETTING_KEYS = [
  SETTING_KEYS.TAX_ENABLED,
  SETTING_KEYS.DEFAULT_TAX_RATE,
  SETTING_KEYS.TAX_INCLUSIVE,
  SETTING_KEYS.TAX_MODE,
  SETTING_KEYS.TAX_COMPONENTS,
] as const

export interface WorkshopTax {
  enabled: boolean
  /** The default rate; the components' combined rate when the tax is split. */
  rate: number
  inclusive: boolean
  /** Set only when the workshop splits its tax and has defined the parts. */
  components: TaxComponentDefinition[] | null
}

export function readWorkshopTax(settings: Record<string, string | undefined>): WorkshopTax {
  const enabled = settings[SETTING_KEYS.TAX_ENABLED] !== 'false'
  const inclusive = settings[SETTING_KEYS.TAX_INCLUSIVE] === 'true'
  const split = settings[SETTING_KEYS.TAX_MODE] === 'split'
  const components = split
    ? parseTaxComponentDefinitions(settings[SETTING_KEYS.TAX_COMPONENTS])
    : null
  const rate = enabled ? Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0 : 0
  return { enabled, rate, inclusive, components: enabled ? components : null }
}

/**
 * The tax fields a new document starts with. A tax-exempt customer gets no
 * tax at all, components included: their invoice must not print a GST line
 * at zero.
 */
export function taxFieldsForNewDocument(
  tax: WorkshopTax,
  opts: { customerExempt?: boolean } = {}
): {
  taxRate: number
  taxInclusive: boolean
  taxComponents: StoredTaxComponent[] | undefined
} {
  const charged = tax.enabled && !opts.customerExempt
  const components = charged ? tax.components : null
  return {
    taxRate: charged ? tax.rate : 0,
    taxInclusive: tax.inclusive,
    // Amounts start at zero; the first re-total writes the real split.
    taxComponents: components
      ? taxComponentsJson(components.map((component) => ({ ...component, amount: 0 })))
      : undefined,
  }
}

/**
 * Totals for a document that may carry components, ready to write back:
 * the combined figures plus the split, or no split when the document has
 * none. Takes the stored Json as-is so callers do not each parse it.
 */
export function documentTotals(args: {
  subtotal: number
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  taxComponents: unknown
}): {
  taxAmount: number
  totalAmount: number
  taxComponents: StoredTaxComponent[] | undefined
} {
  const definitions = parseTaxComponentDefinitions(args.taxComponents)
  const result = calculateTotals({
    subtotal: args.subtotal,
    discountAmount: args.discountAmount,
    taxRate: args.taxRate,
    taxInclusive: args.taxInclusive,
    components: definitions,
  })
  return {
    taxAmount: result.taxAmount,
    totalAmount: result.totalAmount,
    taxComponents: result.components ? taxComponentsJson(result.components) : undefined,
  }
}

/**
 * A stored breakdown copied from one document to another (a quote becoming
 * a job, a template becoming an invoice, a backup being restored). Read
 * leniently and written clean; nothing when the source has none.
 */
export function taxComponentsForCopy(value: unknown): StoredTaxComponent[] | undefined {
  const components = parseTaxComponents(value)
  return components ? taxComponentsJson(components) : undefined
}
