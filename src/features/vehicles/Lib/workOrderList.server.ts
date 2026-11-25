import { isCustomerReferenceEnabled } from '@/features/customer-reference/Lib/referenceSetting'
import { typeKeySearch } from '@/features/vehicles/Lib/typeKeySetting'
import { CANCELLED } from '@/features/work-order-statuses/Lib/stages'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'
import { zonedDayKey } from '@/lib/timezone'
import { endOfWorkshopDay } from '@/lib/workshop-datetime'
import { workshopTimeZone } from '@/lib/workshop-timezone'

/**
 * The work order list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const WORK_ORDER_BATCH_SIZE = 50

export type WorkOrderListFilters = {
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  /** 'today': what the workshop owes a customer by the end of today. */
  due?: string
}

export async function workOrderListWhere(organizationId: string, params: WorkOrderListFilters) {
  const where: any = { organizationId }
  const referenceOn = await isCustomerReferenceEnabled(organizationId)

  // Promised to a customer for today or earlier, and not handed over.
  // Anything already late belongs to the same answer: it was due before
  // today and is still owed. "Today" is the workshop's own day, not the
  // server's, or a shop an hour ahead loses its evening.
  if (params.due === 'today') {
    const timeZone = await workshopTimeZone(organizationId)
    const endOfToday = endOfWorkshopDay(zonedDayKey(new Date(), timeZone), timeZone)
    if (endOfToday) {
      where.promisedAt = { not: null, lte: endOfToday }
      where.AND = [...(where.AND ?? []), { status: { notIn: ['completed', CANCELLED] } }]
    }
  }

  if (params.status === 'active') {
    // A cancelled job is not work still to do.
    where.status = { notIn: ['completed', CANCELLED] }
  } else if (params.status && params.status !== 'all') {
    where.status = params.status
  }

  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { invoiceNumber: { contains: params.search, mode: 'insensitive' } },
      { techName: { contains: params.search, mode: 'insensitive' } },
      { vehicle: { licensePlate: { contains: params.search, mode: 'insensitive' } } },
      ...(await typeKeySearch(organizationId, params.search)).map((vehicle) => ({ vehicle })),
      { vehicle: { customer: { name: { contains: params.search, mode: 'insensitive' } } } },
      { customer: { name: { contains: params.search, mode: 'insensitive' } } },
      // The customer's reference / PO, for a workshop that uses the field.
      ...(referenceOn
        ? [{ customerReference: { contains: params.search, mode: 'insensitive' } }]
        : []),
    ]
  }

  return { where, referenceOn }
}

/**
 * What the list is sorted by, column by column. The id breaks the last tie
 * (lib/keyset.ts adds it).
 */
export function workOrderListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): KeysetPart[] {
  const dir = sortOrder || 'desc'
  switch (sortBy) {
    case 'invoiceNumber':
      return [keysetColumn(['invoiceNumber'], dir, 'string', { nullable: true })]
    case 'title':
      return [keysetColumn(['title'], dir, 'string')]
    case 'status':
      return [keysetColumn(['status'], dir, 'string')]
    case 'techName':
      return [keysetColumn(['techName'], dir, 'string', { nullable: true })]
    case 'totalAmount':
      return [keysetColumn(['totalAmount'], dir, 'number')]
    // What the customer was told. A job with no promise made sorts last
    // either way: it is not late, and it is not "soonest".
    case 'promisedAt':
      return [keysetColumn(['promisedAt'], dir, 'date', { nullable: true, nulls: 'last' })]
    // When the job itself was last saved, newest first by default.
    case 'updatedAt':
      return [keysetColumn(['updatedAt'], dir, 'date')]
    // Column shows "year make model"; sort make, model, year so identical
    // models group together. A counter sale has no vehicle.
    case 'vehicle':
      return [
        keysetColumn(['vehicle', 'make'], dir, 'string'),
        keysetColumn(['vehicle', 'model'], dir, 'string'),
        keysetColumn(['vehicle', 'year'], dir, 'number'),
      ]
    case 'customer':
      return [keysetColumn(['vehicle', 'customer', 'name'], dir, 'string')]
    default:
      // The date the job is presented with: the scheduled start when there is
      // one, else the service date. Records without a start (imported, older)
      // group at the old end: first ascending, last descending.
      return [
        keysetColumn(['startDateTime'], dir, 'date', {
          nullable: true,
          nulls: dir === 'asc' ? 'first' : 'last',
        }),
        keysetColumn(['serviceDate'], dir, 'date'),
      ]
  }
}

export const workOrderListInclude = {
  // The workshop's own status, shown beside the stage in the list.
  customStatus: { select: { name: true, color: true } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  vehicle: {
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      licensePlate: true,
      customer: { select: { id: true, name: true, email: true, phone: true } },
    },
  },
} as const
