import { keysetColumn, type KeysetPart } from '@/lib/keyset'

/**
 * The customer list's query, in one place: the page's first batch and every
 * batch loaded while scrolling are built here, so the rows that arrive later
 * are always the same list the page started.
 */

/** Rows per batch: the page's first paint and each batch after it. */
export const CUSTOMER_BATCH_SIZE = 50

export type CustomerListFilters = {
  search?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

const FIELDS = ['name', 'email', 'phone', 'company', 'customerNumber'] as const

export function customerListWhere(organizationId: string, params: CustomerListFilters) {
  const where: any = { organizationId }
  const search = params.search?.trim()
  if (!search) return where

  // Every word has to match some field, in any order: "berg volvo" finds Ada
  // Berg at Volvo.
  const words = search.split(/\s+/).filter(Boolean)
  const anyField = (word: string) =>
    FIELDS.map((field) => ({ [field]: { contains: word, mode: 'insensitive' } }))
  if (words.length > 1) where.AND = words.map((word) => ({ OR: anyField(word) }))
  else where.OR = anyField(search)
  return where
}

/**
 * How the list is sorted. Most columns are a keyset on the column and the id
 * (lib/keyset.ts). The vehicle count is not a column Prisma can compare
 * against, so that one sort pages by position instead: a customer added or
 * deleted while somebody scrolls can shift it by a row, which the infinite
 * list's own de-duplication hides on the repeat side.
 */
export type CustomerListSort =
  | { kind: 'keyset'; parts: KeysetPart[] }
  | { kind: 'offset'; orderBy: Record<string, any>[] }

export function customerListSort(sortBy?: string, sortOrder?: 'asc' | 'desc'): CustomerListSort {
  const dir = sortOrder || 'desc'
  const nullsLast = (column: string) =>
    keysetColumn([column], dir, 'string', { nullable: true, nulls: 'last' })
  switch (sortBy) {
    case 'number':
      return { kind: 'keyset', parts: [nullsLast('customerNumber')] }
    case 'name':
      return { kind: 'keyset', parts: [keysetColumn(['name'], dir, 'string')] }
    case 'company':
    case 'phone':
    case 'email':
      return { kind: 'keyset', parts: [nullsLast(sortBy)] }
    case 'vehicles':
      return { kind: 'offset', orderBy: [{ vehicles: { _count: dir } }, { id: 'asc' }] }
    default:
      // Most recently touched first, whatever the direction asked for.
      return { kind: 'keyset', parts: [keysetColumn(['updatedAt'], 'desc', 'date')] }
  }
}

export const customerListInclude = {
  _count: { select: { vehicles: true } },
} as const
