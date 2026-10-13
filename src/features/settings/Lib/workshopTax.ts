import { calculateTotals, storedTaxableSubtotal, type TaxComponentDefinition } from '@/lib/tax'
import { TAX_APPLIES_TO_ALL, type TaxApplies, taxableSubtotalOf } from '@/lib/taxable-lines'
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
  SETTING_KEYS.TAX_SELECTIVE,
  SETTING_KEYS.TAX_APPLIES_TO_PARTS,
  SETTING_KEYS.TAX_APPLIES_TO_LABOR,
  SETTING_KEYS.TAX_APPLIES_TO_SHOP_FEE,
] as const

/** The keys readTaxApplies reads, for a path that needs nothing else about the tax. */
export const TAX_APPLIES_SETTING_KEYS = [
  SETTING_KEYS.TAX_SELECTIVE,
  SETTING_KEYS.TAX_APPLIES_TO_PARTS,
  SETTING_KEYS.TAX_APPLIES_TO_LABOR,
  SETTING_KEYS.TAX_APPLIES_TO_SHOP_FEE,
] as const

export interface WorkshopTax {
  enabled: boolean
  /** The default rate; the components' combined rate when the tax is split. */
  rate: number
  inclusive: boolean
  /** Set only when the workshop splits its tax and has defined the parts. */
  components: TaxComponentDefinition[] | null
  /** Which kinds of line a new line is taxed for; all of them unless switched off. */
  applies: TaxApplies
}

/** Whether the workshop taxes only some of what it charges (Settings, Tax). */
export function readTaxSelective(settings: Record<string, string | undefined>): boolean {
  return settings[SETTING_KEYS.TAX_SELECTIVE] === 'true'
}

/**
 * Which kinds of charge the workshop taxes. Read apart from the rest of the
 * tax so the pages that only need this (an editor defaulting a new line) do
 * not have to build the whole picture.
 *
 * Everything, unless the workshop has said it taxes only some charges: the
 * three answers are kept when that is switched off again, so they come back
 * with it, but they decide nothing while it is off.
 */
export function readTaxApplies(settings: Record<string, string | undefined>): TaxApplies {
  if (!readTaxSelective(settings)) return TAX_APPLIES_TO_ALL
  return {
    parts: settings[SETTING_KEYS.TAX_APPLIES_TO_PARTS] !== 'false',
    labor: settings[SETTING_KEYS.TAX_APPLIES_TO_LABOR] !== 'false',
    shopFee: settings[SETTING_KEYS.TAX_APPLIES_TO_SHOP_FEE] !== 'false',
  }
}

/**
 * What the line editors need to know about the tax: whether to offer the
 * choice on each line at all, and what a line that has not chosen gets.
 */
export interface LineTaxSettings {
  selective: boolean
  applies: TaxApplies
  /**
   * Set on a document that carries no tax rate: the choice on each line
   * decides nothing there, so the editors do not offer it.
   */
  untaxedDocument?: boolean
}

export function readLineTaxSettings(settings: Record<string, string | undefined>): LineTaxSettings {
  return { selective: readTaxSelective(settings), applies: readTaxApplies(settings) }
}

export function readWorkshopTax(settings: Record<string, string | undefined>): WorkshopTax {
  const enabled = settings[SETTING_KEYS.TAX_ENABLED] !== 'false'
  const inclusive = settings[SETTING_KEYS.TAX_INCLUSIVE] === 'true'
  const split = settings[SETTING_KEYS.TAX_MODE] === 'split'
  const components = split
    ? parseTaxComponentDefinitions(settings[SETTING_KEYS.TAX_COMPONENTS])
    : null
  const rate = enabled ? Number(settings[SETTING_KEYS.DEFAULT_TAX_RATE]) || 0 : 0
  return {
    enabled,
    rate,
    inclusive,
    components: enabled ? components : null,
    applies: readTaxApplies(settings),
  }
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
 *
 * `taxableSubtotal` is the sum of the document's taxable lines, and has to
 * be said: null for a document whose every line is taxed. It is asked for
 * rather than assumed so that no path can total a document without having
 * looked at which of its lines are taxed. The same figure comes back in its
 * stored form (null when it is the whole subtotal) to be written with the
 * totals, so the row always says what its tax was charged on.
 */
export function documentTotals(args: {
  subtotal: number
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  taxComponents: unknown
  taxableSubtotal: number | null
}): {
  taxAmount: number
  totalAmount: number
  taxComponents: StoredTaxComponent[] | undefined
  taxableSubtotal: number | null
} {
  const definitions = parseTaxComponentDefinitions(args.taxComponents)
  const result = calculateTotals({
    subtotal: args.subtotal,
    discountAmount: args.discountAmount,
    taxRate: args.taxRate,
    taxInclusive: args.taxInclusive,
    components: definitions,
    taxableSubtotal: args.taxableSubtotal,
  })
  return {
    taxAmount: result.taxAmount,
    totalAmount: result.totalAmount,
    taxComponents: result.components ? taxComponentsJson(result.components) : undefined,
    taxableSubtotal: storedTaxableSubtotal(args.subtotal, args.taxableSubtotal),
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

type SavedLine = { total?: number | null; taxable: boolean; excluded?: boolean | null }

/**
 * The server's word on the tax of a document an editor is saving.
 *
 * The editors total a document as it is typed and send the figures along
 * with the lines. Those figures are taken as sent while every line is taxed
 * and the tax is one rate, which is how it has always worked. They are
 * worked out again here, from the lines as they will be stored, in the two
 * cases where the lines decide the answer: when the document splits its tax
 * into components, and when some line is left out of the tax. A page that
 * was open before a deploy, or a client that knows nothing of untaxed lines,
 * therefore cannot store a tax that disagrees with the lines beside it.
 *
 * `parts` and `labor` are the lines the subtotal was summed from, with the
 * flag already settled (see withTaxableParts). A quote's declined lines are
 * skipped, as they are in its subtotal.
 *
 * Returns the taxable subtotal to store, and the totals to store instead of
 * the caller's, or null when the caller's stand.
 */
export function savedDocumentTax(args: {
  subtotal: number
  discountAmount: number
  taxRate: number
  taxInclusive: boolean
  /** The document's stored components, when it has them. */
  taxComponents: unknown
  parts: readonly SavedLine[]
  labor: readonly (SavedLine & { pricingType?: string | null })[]
}): {
  taxableSubtotal: number | null
  totals: {
    taxAmount: number
    totalAmount: number
    taxComponents: StoredTaxComponent[] | undefined
  } | null
} {
  const counted = <T extends SavedLine>(lines: readonly T[]) =>
    lines.filter((line) => !line.excluded)
  const taxableSum = taxableSubtotalOf(counted(args.parts), counted(args.labor))
  const taxableSubtotal = storedTaxableSubtotal(args.subtotal, taxableSum)
  const split = parseTaxComponentDefinitions(args.taxComponents)
  if (taxableSubtotal === null && !split) return { taxableSubtotal, totals: null }
  const totals = documentTotals({
    subtotal: args.subtotal,
    discountAmount: args.discountAmount,
    taxRate: args.taxRate,
    taxInclusive: args.taxInclusive,
    taxComponents: args.taxComponents,
    taxableSubtotal,
  })
  return {
    taxableSubtotal,
    totals: {
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      taxComponents: totals.taxComponents,
    },
  }
}
