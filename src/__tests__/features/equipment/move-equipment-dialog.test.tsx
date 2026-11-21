/**
 * Moving an item: the list offers the other vehicles only. The vehicle the
 * item is on now, and "None", are not somewhere it can go.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const vehicles = vi.hoisted(() => [
  {
    id: 'veh-truck',
    make: 'Scania',
    model: 'R 450',
    year: 2019,
    licensePlate: 'ZZ19 TST',
    fleetNumber: 'T-208',
    customerId: 'c-1',
    customer: { id: 'c-1', name: 'ZZ Nordvik Transport Ltd' },
  },
  {
    id: 'veh-van',
    make: 'Ford',
    model: 'Transit',
    year: 2021,
    licensePlate: 'ZZ21 VAN',
    fleetNumber: null,
    customerId: 'c-1',
    customer: { id: 'c-1', name: 'ZZ Nordvik Transport Ltd' },
  },
])
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  searchVehicles: vi.fn(async () => ({ success: true, data: vehicles })),
}))
vi.mock('@/features/equipment/Actions/equipmentItemActions', () => ({
  moveEquipmentItem: vi.fn(async () => ({ success: true, data: {} })),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { moveEquipmentItem } from '@/features/equipment/Actions/equipmentItemActions'
import { MoveEquipmentDialog } from '@/features/equipment/Components/MoveEquipmentDialog'

class StubObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('ResizeObserver', StubObserver)
  // cmdk measures its list; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn()
})

async function openList(vehicleId: string) {
  render(
    <MoveEquipmentDialog
      item={{ id: 'eq-1', vehicleId, label: 'Hook loader' } as never}
      onClose={vi.fn()}
    />
  )
  await act(async () => {
    fireEvent.click(screen.getByRole('combobox'))
  })
  await screen.findAllByRole('option')
}

describe('the vehicle list in the move dialog', () => {
  it('leaves out the vehicle the item is on now, and offers no "None"', async () => {
    await openList('veh-truck')
    const names = screen.getAllByRole('option').map((o) => o.textContent)
    expect(names.some((n) => n?.includes('Transit'))).toBe(true)
    expect(names.some((n) => n?.includes('Scania'))).toBe(false)
    expect(names.some((n) => n?.trim() === 'None')).toBe(false)
  })

  it('offers every other vehicle', async () => {
    await openList('veh-elsewhere')
    const names = screen.getAllByRole('option').map((o) => o.textContent)
    expect(names.filter((n) => /Scania|Transit/.test(n ?? ''))).toHaveLength(2)
  })
})

describe('the move dialog while the move is under way', () => {
  it('takes no other vehicle until it is over, and takes one again once it has failed', async () => {
    let finish: (value: { success: boolean; error?: string }) => void = () => undefined
    vi.mocked(moveEquipmentItem).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish
        }) as never
    )
    await openList('veh-truck')
    await act(async () => {
      fireEvent.click(
        screen.getAllByRole('option').find((o) => /Transit/.test(o.textContent ?? ''))!
      )
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    })
    expect(screen.getByRole('combobox')).toBeDisabled()

    await act(async () => {
      finish({ success: false, error: 'offline' })
    })
    expect(screen.getByRole('combobox')).toBeEnabled()
  })
})
