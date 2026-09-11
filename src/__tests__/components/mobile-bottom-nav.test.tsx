/**
 * The phone's bottom bar names the vehicle list the way the sidebar does.
 *
 * A marine workshop services vessels, and the sidebar already says so. The
 * bottom bar is the same link on a phone, and it said "Vehicles" to every
 * workshop until it followed the service type too.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ServiceTypeProvider } from '@/components/service-type-context'

vi.mock('next/navigation', () => ({
  usePathname: () => '/work-orders',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/barcode-scanner-dialog', () => ({ BarcodeScannerDialog: () => null }))
vi.mock('@/features/inventory/Components/InventoryPartForm', () => ({
  InventoryPartForm: () => null,
}))
vi.mock('@/features/inventory/Actions/lookupPartByBarcode', () => ({
  lookupPartByBarcode: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/inventoryActions', () => ({
  adjustInventoryStock: vi.fn(),
  getInventoryPart: vi.fn(),
}))

const { MobileBottomNav } = await import('@/components/mobile-bottom-nav')

function renderNav(serviceType?: string) {
  return render(
    <ServiceTypeProvider serviceType={serviceType}>
      <MobileBottomNav />
    </ServiceTypeProvider>
  )
}

describe('MobileBottomNav', () => {
  it('shows Vehicles with a car to an automotive workshop', () => {
    renderNav('automotive')
    const link = screen.getByRole('link', { name: 'Vehicles' })
    expect(link).toHaveAttribute('href', '/vehicles')
    expect(link.querySelector('.lucide-car')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Vessels' })).toBeNull()
  })

  it('treats a workshop with no service type stored as automotive', () => {
    renderNav(undefined)
    expect(screen.getByRole('link', { name: 'Vehicles' })).toBeInTheDocument()
  })

  it('shows Vessels with a ship to a marine workshop, on the same list', () => {
    renderNav('marine')
    const link = screen.getByRole('link', { name: 'Vessels' })
    expect(link).toHaveAttribute('href', '/vehicles')
    expect(link.querySelector('.lucide-ship')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Vehicles' })).toBeNull()
  })
})
