/**
 * The reminder form's vehicle list belongs to the customer chosen above it.
 *
 * Vehicles are searched on the server, so the list on screen is whatever the
 * last answer was. After the customer changes, that answer is about somebody
 * else: picking from it would put the reminder on another customer's vehicle
 * and switch the customer back without a word.
 */

import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

// Radix measures the popover's anchor; jsdom has no ResizeObserver, and
// nothing here needs measuring.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

vi.mock('@/components/date-settings-context', () => ({
  useDateSettings: () => ({ timezone: 'UTC' }),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/features/vehicles/Actions/reminderActions', () => ({
  createReminder: vi.fn(),
  updateReminder: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// One button per customer stands in for the customer search
vi.mock('@/features/quotes/Components/CustomerCombobox', () => ({
  CustomerCombobox: ({ onChange }: { onChange: (id: string) => void }) => (
    <div>
      <button type="button" onClick={() => onChange('anna')}>
        Customer Anna
      </button>
      <button type="button" onClick={() => onChange('bert')}>
        Customer Bert
      </button>
    </div>
  ),
}))

const annasCar = {
  id: 'v-anna',
  make: 'Volvo',
  model: 'V70',
  year: 2015,
  licensePlate: 'ANNA-1',
  customerId: 'anna',
  customer: { id: 'anna', name: 'Anna' },
}

const searchVehicles = vi.hoisted(() => vi.fn())
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({ searchVehicles }))

const { ReminderFormDialog } = await import('@/features/vehicles/Components/ReminderFormDialog')

describe('ReminderFormDialog vehicle list', () => {
  it("does not offer the previous customer's vehicles while the new list loads", async () => {
    // Anna's vehicles come back at once; Bert's search is still on its way
    searchVehicles.mockImplementation(
      (_q: string | undefined, _limit: number, _offset: number, customerId?: string) =>
        customerId === 'anna'
          ? Promise.resolve({ success: true, data: [annasCar] })
          : new Promise(noop)
    )
    render(<ReminderFormDialog open onOpenChange={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Customer Anna' }))
    fireEvent.click(screen.getByRole('combobox'))
    expect(await screen.findByText('2015 Volvo V70')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByPlaceholderText('Search vehicles...'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('2015 Volvo V70')).toBeNull())

    fireEvent.click(screen.getByRole('button', { name: 'Customer Bert' }))
    fireEvent.click(screen.getByRole('combobox'))
    await waitFor(() => expect(searchVehicles).toHaveBeenLastCalledWith(undefined, 50, 0, 'bert'))
    expect(screen.queryByText('2015 Volvo V70')).toBeNull()
  })
})
