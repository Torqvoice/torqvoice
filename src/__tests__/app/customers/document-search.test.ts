import { describe, expect, it } from 'vitest'
import {
  type DocumentRow,
  visibleDocuments,
} from '@/app/(authenticated)/customers/[id]/customer-detail-client'

/**
 * A customer's invoices show each status as its label ("In Progress"), so a
 * search for what the badge says has to find it, in whatever language the
 * reader uses, and sorting by status follows the labels too.
 */
const row = (id: string, status: string): DocumentRow => ({
  id,
  href: `/x/${id}`,
  number: id,
  title: 'Brake pads',
  vehicle: null,
  status,
  date: new Date('2026-11-08T12:00:00Z'),
  total: 100,
})
const rows = [row('2026-1', 'completed'), row('2026-2', 'in-progress'), row('2026-3', 'pending')]
const german: Record<string, string> = {
  completed: 'Abgeschlossen',
  'in-progress': 'In Bearbeitung',
  pending: 'Ausstehend',
}
const options = {
  sortBy: 'number' as const,
  sortOrder: 'asc' as const,
  vehicleLabel: () => '',
  statusLabel: (status: string) => german[status] ?? status,
}

describe("a customer's documents", () => {
  it('are found by the status label the reader sees', () => {
    const found = visibleDocuments(rows, { ...options, search: 'in bearbeitung' })
    expect(found.map((r) => r.id)).toEqual(['2026-2'])
  })

  it('are still found by the stored status', () => {
    const found = visibleDocuments(rows, { ...options, search: 'pending' })
    expect(found.map((r) => r.id)).toEqual(['2026-3'])
  })

  it('sort by status in the order the labels read', () => {
    const sorted = visibleDocuments(rows, { ...options, search: '', sortBy: 'status' })
    expect(sorted.map((r) => german[r.status])).toEqual([
      'Abgeschlossen',
      'Ausstehend',
      'In Bearbeitung',
    ])
  })
})
