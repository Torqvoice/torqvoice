import { isCustomerReferenceEnabled } from '@/features/customer-reference/Lib/referenceSetting'
import { ATTENTION_STATUSES } from '@/features/quotes/Lib/quoteStatus'
import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The quote list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const QUOTE_BATCH_SIZE = 50

export type QuoteListFilters = {
  search?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export async function quoteListWhere(organizationId: string, params: QuoteListFilters) {
  const where: any = { organizationId }

  if (params.status === 'attention') {
    where.status = { in: ATTENTION_STATUSES }
  } else if (params.status && params.status !== 'all') {
    where.status = params.status
  }

  // The customer's reference / PO, for a workshop that uses the field.
  const referenceOn = await isCustomerReferenceEnabled(organizationId)
  if (params.search) {
    where.OR = [
      { title: { contains: params.search, mode: 'insensitive' } },
      { quoteNumber: { contains: params.search, mode: 'insensitive' } },
      { customer: { name: { contains: params.search, mode: 'insensitive' } } },
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
export function quoteListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): KeysetPart[] {
  const dir = sortOrder || 'desc'
  switch (sortBy) {
    case 'quoteNumber':
      return [keysetColumn(['quoteNumber'], dir, 'string', { nullable: true, nulls: 'last' })]
    case 'title':
      return [keysetColumn(['title'], dir, 'string')]
    case 'customer':
      return [keysetColumn(['customer', 'name'], dir, 'string')]
    // Column shows "year make model"; sort make, model, year so identical
    // models group together. A quote need not name a vehicle.
    case 'vehicle':
      return [
        keysetColumn(['vehicle', 'make'], dir, 'string'),
        keysetColumn(['vehicle', 'model'], dir, 'string'),
        keysetColumn(['vehicle', 'year'], dir, 'number'),
      ]
    case 'status':
      return [keysetColumn(['status'], dir, 'string')]
    case 'totalAmount':
      return [keysetColumn(['totalAmount'], dir, 'number')]
    case 'createdAt':
      return [keysetColumn(['createdAt'], dir, 'date')]
    default:
      return [keysetColumn(['createdAt'], 'desc', 'date')]
  }
}

export const quoteListInclude = {
  customer: { select: { id: true, name: true } },
  vehicle: {
    select: { id: true, make: true, model: true, year: true, licensePlate: true },
  },
} as const
