/**
 * Shapes shared between the analyze route and the wizard. Kept free of server
 * imports so the client bundle can use them.
 */

import type { FieldGroup, FieldType, ImportEntity } from './fields'
import type { DateFormat, DecimalSeparator } from './normalize'
import type { ColumnMapping, MappingSource } from './suggest'

export interface AnalyzeResponse {
  token: string
  fileName: string
  format: 'csv' | 'xlsx' | 'vcard'
  sheetName: string | null
  delimiter: string | null
  encoding: string | null
  columns: string[]
  sampleRows: string[][]
  totalRows: number
  suggestion: {
    mapping: ColumnMapping
    source: Record<string, MappingSource>
    presetId: string | null
    dateFormat: DateFormat
    decimalSeparator: DecimalSeparator
  }
  fields: { key: string; group: FieldGroup; type: FieldType }[]
  presets: { id: string; name: string }[]
  defaults: { countryCode: string | null }
  aiAvailable: boolean
}

export const IMPORT_ENTITIES: readonly ImportEntity[] = ['customers', 'vehicles', 'services']

/** What a mapping must include before a dry run makes sense. */
export function missingRequired(entity: ImportEntity, mapping: ColumnMapping): string[] {
  const mapped = new Set(Object.values(mapping))
  const has = (...keys: string[]) => keys.some((k) => mapped.has(k))
  const missing: string[] = []
  if (entity === 'customers') {
    if (!has('customer.name', 'customer.firstName', 'customer.lastName', 'customer.company'))
      missing.push('customer.name')
  }
  if (entity === 'vehicles') {
    if (!has('vehicle.make', 'vehicle.description')) missing.push('vehicle.make')
    if (!has('vehicle.model', 'vehicle.description')) missing.push('vehicle.model')
    if (!has('vehicle.year', 'vehicle.description')) missing.push('vehicle.year')
  }
  if (entity === 'services') {
    if (!has('service.date')) missing.push('service.date')
    if (!has('service.title', 'service.description')) missing.push('service.title')
    if (!has('vehicle.licensePlate', 'vehicle.vin', 'vehicle.make', 'vehicle.description'))
      missing.push('vehicle.licensePlate')
  }
  return missing
}
