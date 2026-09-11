import { z } from 'zod'
import { combinedTaxRate, type TaxComponent, type TaxComponentDefinition } from './tax'

/**
 * The stored shape of a document's tax components, and the workshop's
 * definition of them in settings.
 *
 * Documents keep a snapshot, not a reference: the components a job was
 * totalled with are copied onto it, registration numbers included, so a
 * later change in settings never rewrites an invoice that has gone out.
 * Both are read leniently, because a row written by an older build, or
 * edited by hand, must render rather than crash the page.
 */

export const MAX_TAX_COMPONENTS = 6

export const taxComponentDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  rate: z.coerce.number().min(0).max(100),
  registrationNumber: z.string().trim().max(60).optional(),
  compound: z.boolean().optional(),
})

export const taxComponentSchema = taxComponentDefinitionSchema.extend({
  amount: z.coerce.number(),
})

const definitionsSchema = z.array(taxComponentDefinitionSchema).max(MAX_TAX_COMPONENTS)
const componentsSchema = z.array(taxComponentSchema).max(MAX_TAX_COMPONENTS)

/** A stored breakdown, or null when the row has none or holds something else. */
export function parseTaxComponents(value: unknown): TaxComponent[] | null {
  if (value == null) return null
  const parsed = componentsSchema.safeParse(typeof value === 'string' ? tryJson(value) : value)
  if (!parsed.success || parsed.data.length === 0) return null
  return parsed.data.map(tidy)
}

/** The workshop's definition from settings, or null when it has none. */
export function parseTaxComponentDefinitions(value: unknown): TaxComponentDefinition[] | null {
  if (value == null || value === '') return null
  const parsed = definitionsSchema.safeParse(typeof value === 'string' ? tryJson(value) : value)
  if (!parsed.success || parsed.data.length === 0) return null
  return parsed.data.map(tidy)
}

function tryJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Drops the optional fields that are empty, so a snapshot holds only what prints. */
function tidy<T extends TaxComponentDefinition>(component: T): T {
  const clean = { ...component }
  if (!clean.registrationNumber) delete clean.registrationNumber
  if (!clean.compound) delete clean.compound
  return clean
}

/**
 * A component as it sits in the Json column: plain data with no undefined
 * fields, the shape Prisma's Json input accepts and the client reads back.
 */
export type StoredTaxComponent = {
  name: string
  rate: number
  amount: number
  registrationNumber?: string
  compound?: boolean
}

/** The value to store in a Json column. */
export function taxComponentsJson(components: TaxComponent[]): StoredTaxComponent[] {
  return components.map((component) => ({
    name: component.name,
    rate: component.rate,
    amount: component.amount,
    ...(component.registrationNumber ? { registrationNumber: component.registrationNumber } : {}),
    ...(component.compound ? { compound: true } : {}),
  }))
}

export function serializeTaxComponentDefinitions(components: TaxComponentDefinition[]): string {
  return JSON.stringify(
    components.map((component) => ({
      name: component.name,
      rate: component.rate,
      ...(component.registrationNumber ? { registrationNumber: component.registrationNumber } : {}),
      ...(component.compound ? { compound: true } : {}),
    }))
  )
}

/** How a component is named on a totals line: "GST (5%)". */
export function taxComponentLabel(component: TaxComponentDefinition): string {
  return `${component.name} (${component.rate}%)`
}

/**
 * Markets whose tax is more than one rate, ready to pick in settings. Only
 * markets a workshop has asked for: each was checked against the regulator
 * in September 2026, and the rates are what the workshop reviews on screen
 * before saving, not something applied behind its back.
 *
 * Registration numbers are the workshop's own and are never preset.
 */
export interface TaxComponentPreset {
  id: string
  /** Translation key under settings.tax.presets. */
  labelKey: string
  components: TaxComponentDefinition[]
}

export const TAX_COMPONENT_PRESETS: TaxComponentPreset[] = [
  {
    id: 'ca-qc',
    labelKey: 'caQc',
    components: [
      { name: 'GST', rate: 5 },
      { name: 'QST', rate: 9.975 },
    ],
  },
  {
    id: 'ca-bc',
    labelKey: 'caBc',
    components: [
      { name: 'GST', rate: 5 },
      { name: 'PST', rate: 7 },
    ],
  },
  {
    id: 'ca-sk',
    labelKey: 'caSk',
    components: [
      { name: 'GST', rate: 5 },
      { name: 'PST', rate: 6 },
    ],
  },
  {
    id: 'ca-mb',
    labelKey: 'caMb',
    components: [
      { name: 'GST', rate: 5 },
      { name: 'RST', rate: 7 },
    ],
  },
  {
    id: 'in-intra',
    labelKey: 'inIntra',
    components: [
      { name: 'CGST', rate: 9 },
      { name: 'SGST', rate: 9 },
    ],
  },
]

export { combinedTaxRate }
