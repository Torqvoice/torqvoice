/**
 * Guessing which column is which.
 *
 * Three passes, each only touching columns and fields the earlier ones left
 * alone: a preset's header map, then the multilingual synonym list (exact
 * match first, then "the header contains a synonym"), then a look at the
 * values themselves, which is what catches a column called "Contact" that
 * is plainly full of email addresses. The user sees the result and corrects
 * it; the aim is that they rarely have to.
 */

import { type ImportEntity, type ImportField, fieldsFor } from './fields'
import {
  type DateFormat,
  type DecimalSeparator,
  detectDateFormat,
  detectDecimalSeparator,
  normalizeHeader,
} from './normalize'
import { detectPreset, presetById } from './presets'

/** Column index (as a string, since it travels as JSON) → field key. */
export type ColumnMapping = Record<string, string>

export type MappingSource = 'preset' | 'header' | 'values'

export interface MappingSuggestion {
  mapping: ColumnMapping
  source: Record<string, MappingSource>
  presetId: string | null
  dateFormat: DateFormat
  decimalSeparator: DecimalSeparator
}

/**
 * When an entity makes a bare header mean something more specific: in a
 * service history, "Notes" and "Mileage" belong to the job, not the customer
 * or the car.
 */
const ENTITY_OVERRIDES: Partial<Record<ImportEntity, Record<string, string>>> = {
  services: {
    notes: 'service.notes',
    note: 'service.notes',
    comments: 'service.notes',
    remarks: 'service.notes',
    mileage: 'service.mileage',
    odometer: 'service.mileage',
    km: 'service.mileage',
    kilometers: 'service.mileage',
    miles: 'service.mileage',
    kilometerstand: 'service.mileage',
    kmstand: 'service.mileage',
    przebieg: 'service.mileage',
    kilometraje: 'service.mileage',
    kilometrage: 'service.mileage',
    description: 'service.description',
    name: 'customer.name',
    date: 'service.date',
    datum: 'service.date',
    dato: 'service.date',
    fecha: 'service.date',
    data: 'service.date',
  },
  vehicles: {
    name: 'customer.name',
    owner: 'customer.name',
    notes: 'customer.notes',
  },
}

/**
 * Words a header can carry around the field it names. Stripped off the ends
 * until the remainder is a known synonym or nothing changes.
 */
const QUALIFIERS = [
  'customer',
  'customers',
  'client',
  'kunde',
  'kunden',
  'klant',
  'cliente',
  'vehicle',
  'car',
  'fahrzeug',
  'bil',
  'primary',
  'main',
  'default',
  'business',
  'work',
  'home',
  'mobile',
  'contact',
  'owner',
  'billing',
  'shipping',
  'service',
  'value',
  'current',
  '1',
  '2',
  '3',
]

function stripQualifiers(header: string): string {
  let h = header
  let changed = true
  while (changed) {
    changed = false
    for (const q of QUALIFIERS) {
      if (h.length > q.length && h.startsWith(q)) {
        h = h.slice(q.length)
        changed = true
      }
      if (h.length > q.length && h.endsWith(q)) {
        h = h.slice(0, -q.length)
        changed = true
      }
    }
  }
  return h
}

const SAMPLE_SIZE = 50

function sampleValues(rows: readonly string[][], col: number): string[] {
  const out: string[] = []
  for (const row of rows) {
    const v = (row[col] ?? '').trim()
    if (v) out.push(v)
    if (out.length >= SAMPLE_SIZE) break
  }
  return out
}

function share(values: readonly string[], test: (v: string) => boolean): number {
  if (values.length === 0) return 0
  let hits = 0
  for (const v of values) if (test(v)) hits++
  return hits / values.length
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/i
const YEAR = /^(19|20)\d{2}$/
const PHONE = /^\+?[\d\s().-]{7,20}$/
const DATE = /^(\d{1,4}[./-]\d{1,2}[./-]\d{1,4})([T ]\d{1,2}:\d{2}.*)?$/
const PLATE = /^[A-Z]{1,3}[\s-]?\d{2,5}[\s-]?[A-Z]{0,3}$/i

export function suggestMapping(
  columns: readonly string[],
  rows: readonly string[][],
  entity: ImportEntity,
  presetId?: string | null
): MappingSuggestion {
  const fields = fieldsFor(entity)
  const byKey = new Map(fields.map((f) => [f.key, f]))
  const mapping: ColumnMapping = {}
  const source: Record<string, MappingSource> = {}
  const used = new Set<string>()

  const assign = (col: number, key: string, how: MappingSource) => {
    if (!byKey.has(key) || used.has(key)) return false
    mapping[String(col)] = key
    source[String(col)] = how
    used.add(key)
    return true
  }

  const normalized = columns.map(normalizeHeader)

  // 1. Preset
  const preset = presetById(presetId) ?? detectPreset(columns)
  if (preset) {
    normalized.forEach((h, col) => {
      const key = preset.headerMap[h]
      if (key) assign(col, key, 'preset')
    })
  }

  // 2. Exact synonym, with the entity's overrides first
  const overrides = ENTITY_OVERRIDES[entity] ?? {}
  const exact = new Map<string, ImportField>()
  for (const f of fields) for (const s of f.synonyms) if (!exact.has(s)) exact.set(s, f)

  normalized.forEach((h, col) => {
    if (mapping[String(col)]) return
    const key = overrides[h] ?? exact.get(h)?.key
    if (key) assign(col, key, 'header')
  })

  // 3. A qualified synonym ("Customer e-mail", "Primary phone", "E-mail address 2"):
  //    strip known qualifiers off both ends and try again. Bare containment
  //    is not enough; "Invoice number" must not become a customer number.
  normalized.forEach((h, col) => {
    if (mapping[String(col)]) return
    const stripped = stripQualifiers(h)
    if (stripped === h || !stripped) return
    const key = overrides[stripped] ?? exact.get(stripped)?.key
    if (key) assign(col, key, 'header')
  })

  // 4. What the values look like
  normalized.forEach((_, col) => {
    if (mapping[String(col)]) return
    const values = sampleValues(rows, col)
    if (values.length < 2) return
    if (share(values, (v) => EMAIL.test(v)) >= 0.8) {
      if (assign(col, 'customer.email', 'values')) return
    }
    if (share(values, (v) => VIN.test(v.replace(/[\s-]/g, ''))) >= 0.8) {
      if (assign(col, 'vehicle.vin', 'values')) return
    }
    if (share(values, (v) => YEAR.test(v)) >= 0.8) {
      if (assign(col, 'vehicle.year', 'values')) return
    }
    if (share(values, (v) => DATE.test(v)) >= 0.8) {
      const key = entity === 'services' ? 'service.date' : 'vehicle.purchaseDate'
      if (assign(col, key, 'values')) return
    }
    if (share(values, (v) => PHONE.test(v) && v.replace(/\D/g, '').length >= 7) >= 0.8) {
      if (assign(col, 'customer.phone', 'values')) return
    }
    if (share(values, (v) => PLATE.test(v)) >= 0.7) {
      if (assign(col, 'vehicle.licensePlate', 'values')) return
    }
  })

  // Formats, read off the columns that ended up as dates and amounts
  const dateValues: string[] = []
  const numberValues: string[] = []
  for (const [col, key] of Object.entries(mapping)) {
    const field = byKey.get(key)
    if (!field) continue
    const values = sampleValues(rows, Number(col))
    if (field.type === 'date') dateValues.push(...values)
    if (field.type === 'number' || field.type === 'integer') numberValues.push(...values)
  }
  const detectedDate = detectDateFormat(dateValues)
  const detectedDecimal = detectDecimalSeparator(numberValues)

  return {
    mapping,
    source,
    presetId: preset?.id ?? null,
    dateFormat: detectedDate !== 'auto' ? detectedDate : (preset?.dateFormat ?? 'auto'),
    decimalSeparator:
      detectedDecimal !== 'auto' ? detectedDecimal : (preset?.decimalSeparator ?? 'auto'),
  }
}
