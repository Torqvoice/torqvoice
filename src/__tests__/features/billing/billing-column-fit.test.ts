/**
 * The billing table shows the chosen columns that fit its width. Columns
 * make way on a narrow table, but a short choice never leaves it empty.
 */
import { describe, expect, it } from 'vitest'
import { fittingColumns } from '@/features/billing/Lib/billingColumnFit'
import { DEFAULT_BILLING_COLUMNS } from '@/features/billing/Schema/billingListSchema'

describe('which chosen columns the table shows', () => {
  it('shows every default column on a wide table', () => {
    expect([...fittingColumns(DEFAULT_BILLING_COLUMNS, 1600)]).toEqual(DEFAULT_BILLING_COLUMNS)
  })

  it('lets the vehicle and the extras make way on a narrower one', () => {
    const shown = fittingColumns(DEFAULT_BILLING_COLUMNS, 900)
    expect(shown.has('vehicle')).toBe(false)
    expect(shown.has('title')).toBe(true)
    expect(shown.has('balance')).toBe(true)
  })

  it('shows a column chosen alone, however narrow the table', () => {
    expect([...fittingColumns(['vehicle'], 500)]).toEqual(['vehicle'])
    expect([...fittingColumns(['vehicle', 'status'], 200)]).toEqual(['status'])
  })

  it('shows a short choice of make-way columns in full when it fits', () => {
    expect([...fittingColumns(['vehicle', 'customer', 'status'], 700)]).toEqual([
      'vehicle',
      'customer',
      'status',
    ])
  })
})
