/**
 * The header's Quick Add menu books an appointment from any screen, for
 * whoever may book, beside starting a work order.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = noop

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/features/vehicles/Actions/vehicleActions', () => ({
  searchVehicles: vi.fn(async () => ({ success: true, data: [] })),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/createDraftServiceRecord', () => ({
  createDraftCounterSale: vi.fn(),
}))
vi.mock('@/features/customers/Actions/customerActions', () => ({
  searchCustomers: vi.fn(async () => ({ success: true, data: [] })),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  findOwnerCandidates: vi.fn(async () => ({ success: true, data: [] })),
  getCustomerOption: vi.fn(async () => ({ success: true, data: null })),
}))
vi.mock('@/features/inspections/Actions/inspectionActions', () => ({ createInspection: vi.fn() }))
vi.mock('@/features/inspections/Actions/templateActions', () => ({
  getTemplates: vi.fn(async () => ({ success: true, data: [] })),
}))
vi.mock('@/features/shortcuts/Actions/saveKeyboardShortcuts', () => ({
  saveKeyboardShortcuts: vi.fn(),
}))

import { BOOKING_EVENT, BookingAccessProvider } from '@/components/booking-launcher'
import { QuickCreateMenu } from '@/components/quick-create-menu'

function openMenu(canBook: boolean) {
  render(
    <BookingAccessProvider value={{ canBook, canAddCustomer: true }}>
      <QuickCreateMenu />
    </BookingAccessProvider>
  )
  fireEvent.keyDown(screen.getByRole('button', { name: 'Quick Add' }), { key: 'Enter' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('QuickCreateMenu', () => {
  it('opens a booking from "Appointment"', async () => {
    openMenu(true)
    const booked = vi.fn()
    document.addEventListener(BOOKING_EVENT, booked)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Appointment' }))
    document.removeEventListener(BOOKING_EVENT, booked)
    expect(booked).toHaveBeenCalledTimes(1)
    expect((booked.mock.calls[0][0] as CustomEvent).detail).toEqual({})
  })

  it('offers no appointment to someone who may not book', async () => {
    openMenu(false)
    expect(await screen.findByRole('menuitem', { name: /Work Order/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Appointment' })).not.toBeInTheDocument()
  })
})
