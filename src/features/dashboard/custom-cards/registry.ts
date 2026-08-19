/**
 * Custom card field registry — the closed vocabulary for user-defined
 * dashboard tables. Users can only reference entities, fields and operators
 * listed here; anything else is rejected server-side. This file is
 * client-safe metadata; the Prisma mapping lives in server-registry.ts.
 */

export const CARD_ENTITIES = ['vehicles', 'customers', 'workOrders', 'quotes', 'inventory'] as const

export type CardEntity = (typeof CARD_ENTITIES)[number]

export type FieldType = 'text' | 'number' | 'date' | 'select'

export const OPERATORS_BY_TYPE: Record<FieldType, readonly string[]> = {
  text: ['contains', 'equals', 'startsWith'],
  number: ['eq', 'gt', 'gte', 'lt', 'lte'],
  date: ['after', 'before'],
  select: ['eq'],
}

export interface CardFieldDef {
  id: string
  /** Key under dashboard.customCards.fields.* */
  labelKey: string
  type: FieldType
  /** For select fields: allowed values (translated via labelKey.<value>) */
  options?: readonly string[]
  /** Fields that make poor filter targets can be display-only */
  filterable?: boolean
}

const f = (
  id: string,
  type: FieldType,
  opts?: { options?: readonly string[]; filterable?: boolean }
): CardFieldDef => ({
  id,
  labelKey: id,
  type,
  options: opts?.options,
  filterable: opts?.filterable ?? true,
})

export const CARD_ENTITY_FIELDS: Record<CardEntity, CardFieldDef[]> = {
  vehicles: [
    f('licensePlate', 'text'),
    f('make', 'text'),
    f('model', 'text'),
    f('year', 'number'),
    f('color', 'text'),
    f('vin', 'text'),
    f('mileage', 'number'),
    f('fuelType', 'text'),
    f('transmission', 'text'),
    f('customer', 'text'),
    f('createdAt', 'date'),
    f('updatedAt', 'date'),
  ],
  customers: [
    f('name', 'text'),
    f('company', 'text'),
    f('email', 'text'),
    f('phone', 'text'),
    f('address', 'text'),
    f('taxId', 'text'),
    f('createdAt', 'date'),
  ],
  workOrders: [
    f('invoiceNumber', 'text'),
    f('title', 'text'),
    f('type', 'select', {
      options: ['maintenance', 'repair', 'upgrade', 'inspection'],
    }),
    f('status', 'select', {
      options: ['pending', 'in-progress', 'waiting-parts', 'completed'],
    }),
    f('techName', 'text'),
    f('totalAmount', 'number'),
    f('serviceDate', 'date'),
    f('vehicle', 'text'),
    f('customer', 'text'),
  ],
  quotes: [
    f('quoteNumber', 'text'),
    f('title', 'text'),
    f('status', 'select', {
      options: ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'],
    }),
    f('totalAmount', 'number'),
    f('validUntil', 'date'),
    f('createdAt', 'date'),
    f('customer', 'text'),
    f('vehicle', 'text'),
  ],
  inventory: [
    f('name', 'text'),
    f('partNumber', 'text'),
    f('category', 'text'),
    f('quantity', 'number'),
    f('minQuantity', 'number'),
    f('unitCost', 'number'),
    f('sellPrice', 'number'),
    f('supplier', 'text'),
  ],
}

export interface CardFilter {
  field: string
  operator: string
  value: string
}

export interface CustomCardConfig {
  entity: CardEntity
  filters: CardFilter[]
  columns: string[]
  limit: number
}

export interface CustomWidget {
  id: string
  name: string
  config: CustomCardConfig
}

export const CUSTOM_CARD_PREFIX = 'custom:'

export function customCardId(widgetId: string): string {
  return `${CUSTOM_CARD_PREFIX}${widgetId}`
}

export function getField(entity: CardEntity, fieldId: string): CardFieldDef | undefined {
  return CARD_ENTITY_FIELDS[entity]?.find((fd) => fd.id === fieldId)
}

/** Validates a raw config against the registry. Returns null when invalid. */
export function sanitizeConfig(raw: unknown): CustomCardConfig | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const entity = c.entity as CardEntity
  if (!CARD_ENTITIES.includes(entity)) return null

  const fields = CARD_ENTITY_FIELDS[entity]
  const fieldIds = new Set(fields.map((fd) => fd.id))

  const columns = Array.isArray(c.columns)
    ? c.columns
        .filter((col): col is string => typeof col === 'string' && fieldIds.has(col))
        .slice(0, 8)
    : []
  if (columns.length === 0) return null

  const filters: CardFilter[] = []
  if (Array.isArray(c.filters)) {
    for (const rawFilter of c.filters.slice(0, 8)) {
      if (!rawFilter || typeof rawFilter !== 'object') continue
      const { field, operator, value } = rawFilter as Record<string, unknown>
      if (typeof field !== 'string' || typeof operator !== 'string' || typeof value !== 'string')
        continue
      const def = getField(entity, field)
      if (!def || def.filterable === false) continue
      if (!OPERATORS_BY_TYPE[def.type].includes(operator)) continue
      if (def.type === 'select' && !def.options?.includes(value)) continue
      if (value.length === 0 || value.length > 200) continue
      filters.push({ field, operator, value })
    }
  }

  const limit =
    typeof c.limit === 'number' && Number.isFinite(c.limit)
      ? Math.max(1, Math.min(25, Math.round(c.limit)))
      : 10

  return { entity, filters, columns, limit }
}
