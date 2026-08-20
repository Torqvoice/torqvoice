import { db } from '@/lib/db'
import { toSafeDate } from '@/lib/invoice-utils'
import { PermissionSubject } from '@/lib/permissions'
import { serviceRecordHref } from '@/lib/service-record'
import type { CardEntity, CardFilter, CustomCardConfig } from './registry'
import { getField } from './registry'

/**
 * Server-side execution for custom cards. Every query is built exclusively
 * from this file's mappings via Prisma's parameterized query builder — user
 * input only ever appears as condition *values*, never as query structure.
 * All queries are read-only findMany calls scoped to the caller's org.
 */

export interface CardRow {
  id: string
  href: string
  cells: Record<string, string | number | null>
}

export const ENTITY_PERMISSION_SUBJECT: Record<CardEntity, PermissionSubject> = {
  vehicles: PermissionSubject.VEHICLES,
  customers: PermissionSubject.CUSTOMERS,
  workOrders: PermissionSubject.SERVICES,
  quotes: PermissionSubject.QUOTES,
  inventory: PermissionSubject.INVENTORY,
}

type Cond = Record<string, unknown>

function textCond(operator: string, value: string): Cond | null {
  switch (operator) {
    case 'contains':
      return { contains: value, mode: 'insensitive' }
    case 'equals':
      return { equals: value, mode: 'insensitive' }
    case 'startsWith':
      return { startsWith: value, mode: 'insensitive' }
    default:
      return null
  }
}

function numberCond(operator: string, value: string): Cond | null {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  switch (operator) {
    case 'eq':
      return { equals: n }
    case 'gt':
      return { gt: n }
    case 'gte':
      return { gte: n }
    case 'lt':
      return { lt: n }
    case 'lte':
      return { lte: n }
    default:
      return null
  }
}

function dateCond(operator: string, value: string): Cond | null {
  const d = toSafeDate(value)
  if (!d) return null
  return operator === 'after' ? { gte: d } : operator === 'before' ? { lte: d } : null
}

function condFor(entity: CardEntity, filter: CardFilter): Cond | null {
  const def = getField(entity, filter.field)
  if (!def) return null
  switch (def.type) {
    case 'text':
      return textCond(filter.operator, filter.value)
    case 'number':
      return numberCond(filter.operator, filter.value)
    case 'date':
      return dateCond(filter.operator, filter.value)
    case 'select':
      return filter.operator === 'eq' && def.options?.includes(filter.value)
        ? { equals: filter.value }
        : null
  }
}

/** "vehicle" pseudo-field: matches make, model or plate with the same op */
function vehicleTextWhere(operator: string, value: string): Cond | null {
  const cond = textCond(operator, value)
  if (!cond) return null
  return { OR: [{ make: cond }, { model: cond }, { licensePlate: cond }] }
}

/** Maps a validated filter to a Prisma where fragment, per entity. */
function whereFor(entity: CardEntity, filter: CardFilter): Cond | null {
  const cond = condFor(entity, filter)
  if (!cond) return null
  const field = filter.field

  switch (entity) {
    case 'vehicles':
      if (field === 'customer') return { customer: { name: cond } }
      return { [field]: cond }
    case 'customers':
      return { [field]: cond }
    case 'workOrders':
      if (field === 'customer') return { vehicle: { customer: { name: cond } } }
      if (field === 'vehicle') {
        const v = vehicleTextWhere(filter.operator, filter.value)
        return v ? { vehicle: v } : null
      }
      return { [field]: cond }
    case 'quotes':
      if (field === 'customer') return { customer: { name: cond } }
      if (field === 'vehicle') {
        const v = vehicleTextWhere(filter.operator, filter.value)
        return v ? { vehicle: v } : null
      }
      return { [field]: cond }
    case 'inventory':
      return { [field]: cond }
  }
}

function buildWhere(config: CustomCardConfig, base: Cond): Cond {
  const conds = config.filters
    .map((filter) => whereFor(config.entity, filter))
    .filter((c): c is Cond => c !== null)
  return conds.length > 0 ? { AND: [base, ...conds] } : base
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null)

export async function runEntityQuery(
  config: CustomCardConfig,
  organizationId: string
): Promise<CardRow[]> {
  const limit = Math.max(1, Math.min(25, config.limit))

  switch (config.entity) {
    case 'vehicles': {
      const rows = await db.vehicle.findMany({
        where: buildWhere(config, { organizationId, isArchived: false }),
        select: {
          id: true,
          licensePlate: true,
          make: true,
          model: true,
          year: true,
          color: true,
          vin: true,
          mileage: true,
          fuelType: true,
          transmission: true,
          createdAt: true,
          updatedAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      })
      return rows.map((r) => ({
        id: r.id,
        href: `/vehicles/${r.id}`,
        cells: {
          licensePlate: r.licensePlate,
          make: r.make,
          model: r.model,
          year: r.year,
          color: r.color,
          vin: r.vin,
          mileage: r.mileage,
          fuelType: r.fuelType,
          transmission: r.transmission,
          customer: r.customer?.name ?? null,
          createdAt: iso(r.createdAt),
          updatedAt: iso(r.updatedAt),
        },
      }))
    }
    case 'customers': {
      const rows = await db.customer.findMany({
        where: buildWhere(config, { organizationId }),
        select: {
          id: true,
          name: true,
          company: true,
          email: true,
          phone: true,
          address: true,
          taxId: true,
          createdAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      })
      return rows.map((r) => ({
        id: r.id,
        href: `/customers/${r.id}`,
        cells: {
          name: r.name,
          company: r.company,
          email: r.email,
          phone: r.phone,
          address: r.address,
          taxId: r.taxId,
          createdAt: iso(r.createdAt),
        },
      }))
    }
    case 'workOrders': {
      const rows = await db.serviceRecord.findMany({
        where: buildWhere(config, { organizationId }),
        select: {
          id: true,
          invoiceNumber: true,
          title: true,
          type: true,
          status: true,
          techName: true,
          totalAmount: true,
          serviceDate: true,
          invoiceDate: true,
          startDateTime: true,
          customer: { select: { name: true } },
          vehicle: {
            select: {
              id: true,
              make: true,
              model: true,
              year: true,
              customer: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return rows.map((r) => ({
        id: r.id,
        href: serviceRecordHref(r),
        cells: {
          invoiceNumber: r.invoiceNumber,
          title: r.title,
          type: r.type,
          status: r.status,
          techName: r.techName,
          totalAmount: r.totalAmount,
          serviceDate: iso(r.invoiceDate ?? r.startDateTime ?? r.serviceDate),
          vehicle: r.vehicle ? `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}` : null,
          customer: (r.customer ?? r.vehicle?.customer)?.name ?? null,
        },
      }))
    }
    case 'quotes': {
      const rows = await db.quote.findMany({
        where: buildWhere(config, { organizationId }),
        select: {
          id: true,
          quoteNumber: true,
          title: true,
          status: true,
          totalAmount: true,
          validUntil: true,
          createdAt: true,
          customer: { select: { name: true } },
          vehicle: { select: { make: true, model: true, year: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      })
      return rows.map((r) => ({
        id: r.id,
        href: `/quotes/${r.id}`,
        cells: {
          quoteNumber: r.quoteNumber,
          title: r.title,
          status: r.status,
          totalAmount: r.totalAmount,
          validUntil: iso(r.validUntil),
          createdAt: iso(r.createdAt),
          customer: r.customer?.name ?? null,
          vehicle: r.vehicle ? `${r.vehicle.year} ${r.vehicle.make} ${r.vehicle.model}` : null,
        },
      }))
    }
    case 'inventory': {
      const rows = await db.inventoryPart.findMany({
        where: buildWhere(config, { organizationId }),
        select: {
          id: true,
          name: true,
          partNumber: true,
          category: true,
          quantity: true,
          minQuantity: true,
          unitCost: true,
          sellPrice: true,
          supplier: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      })
      return rows.map((r) => ({
        id: r.id,
        href: `/inventory/${r.id}`,
        cells: {
          name: r.name,
          partNumber: r.partNumber,
          category: r.category,
          quantity: r.quantity,
          minQuantity: r.minQuantity,
          unitCost: r.unitCost,
          sellPrice: r.sellPrice,
          supplier: r.supplier,
        },
      }))
    }
  }
}
