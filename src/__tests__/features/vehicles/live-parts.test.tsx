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
import type { ServiceLaborInput, ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'

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

function props(partItems: ServicePartInput[], laborItems: ServiceLaborInput[] = []) {
  return {
    vehicleId: 'veh-1',
    defaultTaxRate: 0,
    currentUserName: 'Desk',
    record: { id: 'rec-1', attachments: [], payments: [] } as never,
    initialData: {
      id: 'rec-1',
      concerns: [],
      partItems,
      laborItems,
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

describe('saving with lines still waiting', () => {
  it('counts them in the totals the save sends', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetPartItems([DESK]))
    rerender(props([DESK, SCANNED]))

    // The list on screen is still the desk's, but the money matches the lines a save writes.
    expect(result.current.partItems).toEqual([DESK])
    expect(result.current.subtotal).toBe(DESK.total + SCANNED.total)
  })

  it('keeps them in the list once a save has written them', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetPartItems([DESK]))
    rerender(props([DESK, SCANNED]))
    act(() => result.current.commitPartsAddedElsewhere())

    // The re-read after the save reads the same as before, so nothing else
    // would bring the part back; the next save must still include it.
    rerender(props([DESK, SCANNED]))
    expect(result.current.partItems).toEqual([DESK, SCANNED])
    expect(result.current.partsAddedElsewhere).toEqual([])
    expect(result.current.partItemsForSave).toEqual([DESK, SCANNED])
  })

  it('leaves a part that arrived while the save ran waiting', () => {
    const { result, rerender } = openPage()
    const late = part('Caliper grease', 9)

    act(() => result.current.dirtySetPartItems([DESK]))
    rerender(props([DESK, SCANNED]))
    // The save goes out with what was waiting then...
    const commitSent = result.current.commitPartsAddedElsewhere
    // ...and another part lands before it comes back.
    rerender(props([DESK, SCANNED, late]))
    act(() => commitSent())

    expect(result.current.partItems).toEqual([DESK, SCANNED])
    expect(result.current.partsAddedElsewhere).toEqual([late])
  })

  it('does the same for labour', () => {
    const { result, rerender } = openPage([])
    const billed: ServiceLaborInput = {
      description: 'Replaced front pads',
      hours: 1,
      rate: 125,
      total: 125,
      pricingType: 'hourly',
    }

    act(() => result.current.dirtySetPartItems([DESK]))
    rerender(props([], [billed]))
    expect(result.current.laborAddedElsewhere).toEqual([billed])
    expect(result.current.subtotal).toBe(DESK.total + 125)

    act(() => result.current.commitLaborAddedElsewhere())
    expect(result.current.laborItems).toEqual([billed])
    expect(result.current.laborAddedElsewhere).toEqual([])
  })
})

describe('the banner', () => {
  it('names parts, labour, or both', () => {
    const { rerender } = render(<LaborAddedBanner count={0} parts={1} onShow={vi.fn()} />)
    expect(screen.getByText('A technician added a part to this job')).toBeInTheDocument()

    rerender(<LaborAddedBanner count={1} parts={2} onShow={vi.fn()} />)
    expect(screen.getByText('A technician added labor and parts to this job')).toBeInTheDocument()

    rerender(<LaborAddedBanner count={0} parts={0} onShow={vi.fn()} />)
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
