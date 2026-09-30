/**
 * A line of work added while the desk has the work order open.
 *
 * The technician app bills time straight onto the job, and the page hears
 * about it on the work board channel and reads the job again. What it may do
 * with the new line depends on whether someone is typing:
 *
 * - nothing being edited: the line is simply there, as after a reload;
 * - mid-edit: the list is left exactly as typed and the line waits, because
 *   this form saves labour by replacing every line. Taking the offer puts it
 *   in the list; ignoring it still saves it, since a line missing from the
 *   payload is a line the save deletes. That is how a technician's work was
 *   lost before: the desk saved a list read before the line existed.
 */
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addedLaborLines } from '@/features/vehicles/Lib/laborLines'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'
import type { ServiceLaborInput } from '@/features/vehicles/Schema/serviceSchema'

vi.mock('@/hooks/use-deferred-commit', () => ({
  useDeferredCommit: () => ({ schedule: vi.fn(), cancel: vi.fn() }),
}))

const line = (description: string, hours = 1, rate = 100): ServiceLaborInput => ({
  description,
  hours,
  rate,
  total: hours * rate,
  pricingType: 'hourly',
})

const DESK = line('Diagnosis', 2)
const FROM_THE_BAY = line('Replaced the timing belt', 1.5)

/** The page's props, as ServiceRecordPage builds them, with these labour lines. */
function props(laborItems: ServiceLaborInput[]) {
  return {
    vehicleId: 'veh-1',
    defaultTaxRate: 0,
    currentUserName: 'Desk',
    record: { id: 'rec-1', attachments: [], payments: [] } as never,
    initialData: {
      id: 'rec-1',
      concerns: [],
      partItems: [],
      laborItems,
      taxRate: 0,
      taxInclusive: false,
      discountValue: 0,
    } as never,
  }
}

function openPage(laborItems: ServiceLaborInput[] = [DESK]) {
  return renderHook((p: ReturnType<typeof props>) => useServiceFormState(p), {
    initialProps: props(laborItems),
  })
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('labour added from the technician app', () => {
  it('appears in the list when nothing is being edited', () => {
    const { result, rerender } = openPage()

    // What a refresh brings back after the app added its line.
    rerender(props([DESK, FROM_THE_BAY]))

    expect(result.current.laborItems).toEqual([DESK, FROM_THE_BAY])
    expect(result.current.laborAddedElsewhere).toEqual([])
    expect(result.current.laborSubtotal).toBe(DESK.total + FROM_THE_BAY.total)
  })

  it('waits while the desk is typing, and leaves what was typed alone', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetLaborItems([line('Diagnosis, gearbox', 3)]))
    rerender(props([DESK, FROM_THE_BAY]))

    expect(result.current.laborItems).toEqual([line('Diagnosis, gearbox', 3)])
    expect(result.current.laborAddedElsewhere).toEqual([FROM_THE_BAY])
  })

  it('is saved even when the offer is never taken', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetLaborItems([line('Diagnosis, gearbox', 3)]))
    rerender(props([DESK, FROM_THE_BAY]))

    expect(result.current.laborItemsForSave).toEqual([line('Diagnosis, gearbox', 3), FROM_THE_BAY])
  })

  it('goes into the list when the offer is taken, and is offered only once', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetLaborItems([DESK, line('Road test')]))
    rerender(props([DESK, FROM_THE_BAY]))
    act(() => result.current.applyLaborAddedElsewhere())

    expect(result.current.laborItems).toEqual([DESK, line('Road test'), FROM_THE_BAY])
    expect(result.current.laborAddedElsewhere).toEqual([])
    // Still dirty, so the line rides along with the edit being made.
    expect(result.current.hasUnsavedChanges).toBe(true)
    expect(result.current.laborItemsForSave).toEqual([DESK, line('Road test'), FROM_THE_BAY])
  })

  it('collects a second line that arrives while the first is still waiting', () => {
    const { result, rerender } = openPage()
    const second = line('Brake fluid', 0.5)

    act(() => result.current.dirtySetLaborItems([line('Diagnosis, gearbox', 3)]))
    rerender(props([DESK, FROM_THE_BAY]))
    rerender(props([DESK, FROM_THE_BAY, second]))

    expect(result.current.laborAddedElsewhere).toEqual([FROM_THE_BAY, second])
  })

  it('a refresh that brings nothing new offers nothing', () => {
    const { result, rerender } = openPage()

    act(() => result.current.dirtySetLaborItems([line('Diagnosis, gearbox', 3)]))
    rerender(props([DESK]))

    expect(result.current.laborAddedElsewhere).toEqual([])
    expect(result.current.laborItems).toEqual([line('Diagnosis, gearbox', 3)])
  })
})

describe('addedLaborLines', () => {
  it('reads a job by what its lines say, since a saved line carries no id', () => {
    expect(addedLaborLines([DESK], [DESK, FROM_THE_BAY])).toEqual([FROM_THE_BAY])
    expect(addedLaborLines([DESK], [DESK])).toEqual([])
    // A line deleted elsewhere is not something to add.
    expect(addedLaborLines([DESK, FROM_THE_BAY], [DESK])).toEqual([])
  })

  it('counts repeats, so a second identical line reads as one added', () => {
    expect(addedLaborLines([DESK], [DESK, DESK])).toEqual([DESK])
    expect(addedLaborLines([DESK, DESK], [DESK, DESK])).toEqual([])
  })

  it('tells lines apart by every field that prints', () => {
    expect(addedLaborLines([line('Service', 1, 100)], [line('Service', 1, 120)])).toEqual([
      line('Service', 1, 120),
    ])
  })
})
