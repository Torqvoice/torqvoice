/**
 * A reading typed with a minus is refused for what it is, under the box it
 * was typed in ("A reading can't be negative."), not with the advice to type
 * a number with two decimals, and nothing is sent.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const addVehicleMeter = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@/features/equipment/Actions/equipmentItemActions', () => ({
  addEquipmentMeter: vi.fn(),
}))
vi.mock('@/features/meters/Actions/vehicleMeterActions', () => ({
  addMeterReading: vi.fn(),
  addVehicleMeter,
  markMeterReadingWrong: vi.fn(),
  removeVehicleMeter: vi.fn(),
  replaceVehicleMeter: vi.fn(),
}))

import { toast } from 'sonner'
import { VehicleMeters } from '@/features/meters/Components/VehicleMeters'

beforeEach(() => {
  vi.clearAllMocks()
  addVehicleMeter.mockResolvedValue({ success: true })
})

describe('a negative reading', () => {
  it('is said under the box and not sent', async () => {
    render(
      <VehicleMeters
        vehicleId="veh-1"
        types={[{ id: 'hours', name: 'Engine hours', unit: 'h' }]}
        meters={[]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add meter' }))
    const dialog = await screen.findByRole('dialog')
    const reading = within(dialog).getByLabelText('First reading (optional)')
    fireEvent.change(reading, { target: { value: '-5' } })
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add meter' }))
    })

    const message = within(dialog).getByText("A reading can't be negative.")
    expect(reading).toHaveAttribute('aria-invalid', 'true')
    expect(reading.getAttribute('aria-describedby')).toContain(message.id)
    expect(reading).toHaveFocus()
    expect(within(dialog).queryByText(/up to two decimals/)).not.toBeInTheDocument()
    expect(toast.error).not.toHaveBeenCalled()
    expect(addVehicleMeter).not.toHaveBeenCalled()

    // Fixed, the mark goes and the meter is added.
    fireEvent.change(reading, { target: { value: '5' } })
    expect(within(dialog).queryByText("A reading can't be negative.")).not.toBeInTheDocument()
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Add meter' }))
    })
    expect(addVehicleMeter).toHaveBeenCalledWith(expect.objectContaining({ value: '5' }))
  })
})
