/**
 * A part line's own price survives a save and a reload.
 *
 * A preset part sold at 133.37 over a stock cost of 100 shows a markup of
 * 33.4%, which rebuilds 133.40, not 133.37. Whether a price was set over the
 * formula is not stored, so the page read every saved line as following it,
 * and the first cost edit after a save repriced the line: a cost of 110 made
 * it 146.74. The page now reads that back from the stored figures, so the
 * price holds and the markup is restated instead.
 *
 * The form state is the real hook; the rows come in the way the work order
 * page builds them from the database.
 */
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'
import { editorPartRow } from '@/features/vehicles/Lib/partLines'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/vehicles/veh-1/service/rec-1',
}))
vi.mock('@/hooks/use-deferred-commit', () => ({
  useDeferredCommit: () => ({ schedule: vi.fn(), cancel: vi.fn() }),
}))

/** A part line as the database holds it after the save. */
const stored = (unitCost: number, markupPercent: number, unitPrice: number) => ({
  partNumber: 'ZZ-WB-500',
  name: 'ZZ Wiper blade',
  quantity: 1,
  unit: null,
  category: null,
  unitPrice,
  total: unitPrice,
  unitCost,
  markupPercent,
  inventoryPartId: 'inv-1',
  taxable: true,
})

function openWorkOrder(parts: ReturnType<typeof stored>[]) {
  return renderHook(() =>
    useServiceFormState({
      vehicleId: 'veh-1',
      defaultTaxRate: 0,
      currentUserName: 'Desk',
      record: { id: 'rec-1', attachments: [], payments: [] } as never,
      initialData: {
        id: 'rec-1',
        status: 'in-progress',
        concerns: [],
        partItems: parts.map(editorPartRow),
        laborItems: [],
        taxRate: 0,
        taxInclusive: false,
        discountValue: 0,
      } as never,
    })
  )
}

describe('a saved part line, opened again', () => {
  it('keeps a price the markup cannot rebuild when its cost is edited', () => {
    const { result } = openWorkOrder([stored(100, 33.4, 133.37)])

    act(() => result.current.updatePart(0, 'unitCost', '110', { commit: true }))

    expect(result.current.partItems[0]).toMatchObject({
      unitCost: '110',
      unitPrice: 133.37,
      markupPercent: 21.2,
      total: 133.37,
    })
  })

  it('still prices from cost and markup a line that follows them', () => {
    const { result } = openWorkOrder([stored(6.4, 95.3, 12.5)])

    act(() => result.current.updatePart(0, 'unitCost', '7', { commit: true }))

    expect(result.current.partItems[0]).toMatchObject({ unitPrice: 13.67, markupPercent: 95.3 })
  })
})
