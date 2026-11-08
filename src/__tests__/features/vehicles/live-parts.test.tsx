/**
 * A part added while the desk has the work order open.
 *
 * The technician app scans a part straight onto the job, the page hears that
 * the job changed and reads it again. The part list used to be read once,
 * when the page opened, so the part never showed and the desk's next save,
 * which replaces every part line, deleted it and put its stock back. It now
 * behaves the way labour does:
 *
 * - nothing being edited: the part is simply there, as after a reload;
 * - mid-edit: the list stays as typed, the part waits behind a banner, and a
 *   save writes it whether or not the banner was taken up.
 */
import { act, render, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { addedPartLines } from '@/features/vehicles/Lib/partLines'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'
import { LaborAddedBanner } from '@/features/vehicles/Components/service-page/LaborAddedBanner'
import type { ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'

vi.mock('@/hooks/use-deferred-commit', () => ({
  useDeferredCommit: () => ({ schedule: vi.fn(), cancel: vi.fn() }),
}))

const part = (name: string, unitPrice = 50, quantity = 1, inventoryPartId?: string) =>
  ({
    name,
    partNumber: '',
    quantity,
    unitPrice,
    total: unitPrice * quantity,
    unitCost: 0,
    markupPercent: 0,
    inventoryPartId,
  }) as ServicePartInput

const DESK = part('Brake cleaner', 12)
const SCANNED = part('Front brake pad set, ceramic', 72, 1, 'inv-pads')

function props(partItems: ServicePartInput[]) {
  return {
    vehicleId: 'veh-1',
    defaultTaxRate: 0,
    currentUserName: 'Desk',
    record: { id: 'rec-1', attachments: [], payments: [] } as never,
    initialData: {
      id: 'rec-1',
      concerns: [],
      partItems,
      laborItems: [],
      taxRate: 0,
      taxInclusive: false,
      discountValue: 0,
    } as never,
  }
}

function openPage(partItems: ServicePartInput[] = [DESK]) {
  return renderHook((p: ReturnType<typeof props>) => useServiceFormState(p), {
    initialProps: props(partItems),
  })
}

describe('a part scanned on from the technician app', () => {
  it('appears in the list and the total when nothing is being edited', () => {
    const { result, rerender } = openPage()

    rerender(props([DESK, SCANNED]))

    expect(result.current.partItems).toEqual([DESK, SCANNED])
    expect(result.current.partsAddedElsewhere).toEqual([])
    expect(result.current.subtotal).toBe(DESK.total + SCANNED.total)
  })

  it('waits while the desk is typing, and is saved even if never shown', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetPartItems([part('Brake cleaner, 2 cans', 24)]))
    rerender(props([DESK, SCANNED]))

    expect(result.current.partItems).toEqual([part('Brake cleaner, 2 cans', 24)])
    expect(result.current.partsAddedElsewhere).toEqual([SCANNED])
    expect(result.current.partItemsForSave).toEqual([part('Brake cleaner, 2 cans', 24), SCANNED])
  })

  it('goes into the list when the offer is taken, once', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetPartItems([DESK, part('Shop rags', 5)]))
    rerender(props([DESK, SCANNED]))
    act(() => result.current.applyPartsAddedElsewhere())

    expect(result.current.partItems).toEqual([DESK, part('Shop rags', 5), SCANNED])
    expect(result.current.partsAddedElsewhere).toEqual([])
    expect(result.current.partItemsForSave).toEqual([DESK, part('Shop rags', 5), SCANNED])
  })
})

describe('the banner', () => {
  it('names parts, labour, or both', () => {
    const { rerender } = render(<LaborAddedBanner count={0} parts={1} onShow={() => {}} />)
    expect(screen.getByText('A technician added a part to this job')).toBeInTheDocument()

    rerender(<LaborAddedBanner count={1} parts={2} onShow={() => {}} />)
    expect(screen.getByText('A technician added labor and parts to this job')).toBeInTheDocument()

    rerender(<LaborAddedBanner count={0} parts={0} onShow={() => {}} />)
    expect(screen.queryByTestId('labor-added-banner')).toBeNull()
  })
})

describe('addedPartLines', () => {
  it('reads parts by what they are, and counts repeats', () => {
    expect(addedPartLines([DESK], [DESK, SCANNED])).toEqual([SCANNED])
    expect(addedPartLines([DESK, SCANNED], [DESK])).toEqual([])
    expect(addedPartLines([SCANNED], [SCANNED, SCANNED])).toEqual([SCANNED])
  })
})
