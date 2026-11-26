/**
 * A part that does not track stock, as the inventory list and the part form
 * show it.
 *
 * A consumables fee kept as a part has no shelf count, so the list says so in
 * place of a number, never calls it low, and the form puts the stock fields
 * away once the switch is off.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const createInventoryPart = vi.fn()
const updateInventoryPart = vi.fn()

// The Track stock switch sits in the form, and Radix measures a switch in a
// form; jsdom has no ResizeObserver.
class NoResize {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
vi.stubGlobal('ResizeObserver', NoResize)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/inventory',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/glass-modal', () => ({
  useGlassModal: () => ({ open: vi.fn() }),
}))
vi.mock('@/components/confirm-dialog', () => ({
  useConfirm: () => vi.fn(),
}))
vi.mock('@/hooks/use-native-camera', () => ({
  useNativeCamera: () => false,
}))
vi.mock('@/hooks/use-hardware-scanner', () => ({
  useHardwareScanner: vi.fn(),
}))
vi.mock('@/hooks/use-remembered-sort', () => ({
  useRememberedSort: vi.fn(),
}))
vi.mock('@/components/barcode-scanner-dialog', () => ({
  BarcodeScannerDialog: () => null,
}))
vi.mock('@/features/inventory/Components/BarcodeScanActionDialog', () => ({
  BarcodeScanActionDialog: () => null,
}))
vi.mock('@/features/inventory/Actions/lookupPartByBarcode', () => ({
  lookupPartByBarcode: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/aiAnalyzePartImage', () => ({
  aiAnalyzePartImage: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/inventoryActions', () => ({
  applyMarkupToAll: vi.fn(),
  createInventoryPart: (...args: unknown[]) => createInventoryPart(...args),
  updateInventoryPart: (...args: unknown[]) => updateInventoryPart(...args),
  deleteInventoryPart: vi.fn(),
  deleteInventoryParts: vi.fn(),
  deleteOrphanedUploads: vi.fn(),
}))
vi.mock('@/features/settings/Actions/settingsActions', () => ({
  setSetting: vi.fn(),
}))

vi.mock('@/features/inventory/Actions/getInventoryRows', () => ({ getInventoryRows: vi.fn() }))

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InventoryClient } from '@/app/(authenticated)/inventory/inventory-client'

type Part = React.ComponentProps<typeof InventoryClient>['data']['rows'][number]

function part(overrides: Partial<Part>): Part {
  return {
    id: 'p1',
    partNumber: null,
    barcode: null,
    name: 'Part',
    description: null,
    category: null,
    quantity: 0,
    minQuantity: 0,
    trackStock: true,
    unit: null,
    unitCost: 0,
    sellPrice: 0,
    supplier: null,
    supplierPhone: null,
    supplierEmail: null,
    supplierUrl: null,
    imageUrl: null,
    gallery: [],
    location: null,
    tags: [],
    ...overrides,
  }
}

function renderList(parts: Part[]) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InventoryClient
        data={{ rows: parts, nextCursor: null, total: parts.length, renderId: 'render-1' }}
        search=""
        category=""
        categories={[]}
        lowStockDefault={5}
      />
    </QueryClientProvider>
  )
}

/** The table row for a part (the phone cards render beside it in jsdom). */
function rowOf(name: string) {
  const row = screen
    .getAllByRole('row')
    .find((candidate) => within(candidate).queryByText(name) !== null)
  if (!row) throw new Error(`No row for ${name}`)
  return row
}

beforeEach(() => {
  createInventoryPart.mockReset().mockResolvedValue({ success: true, data: { id: 'new' } })
  updateInventoryPart.mockReset().mockResolvedValue({ success: true })
})

describe('the inventory list', () => {
  it('says Not tracked in place of a quantity, and never calls the part low', () => {
    renderList([
      part({ id: 'fee', name: 'Consumables fee', trackStock: false }),
      // Counted, and under the workshop's reorder point of 5.
      part({ id: 'filter', name: 'Oil filter', quantity: 2, unit: 'pcs' }),
    ])

    const fee = rowOf('Consumables fee')
    expect(within(fee).getByText('Not tracked')).toBeInTheDocument()
    expect(within(fee).queryByText('Low')).not.toBeInTheDocument()

    const filter = rowOf('Oil filter')
    expect(within(filter).getByText('2 pcs')).toBeInTheDocument()
    expect(within(filter).getByText('Low')).toBeInTheDocument()
    expect(within(filter).queryByText('Not tracked')).not.toBeInTheDocument()
  })
})

describe('the part form', () => {
  it('hides the stock fields once Track stock is off and saves the part uncounted', async () => {
    const user = userEvent.setup()
    renderList([])

    await user.click(screen.getAllByRole('button', { name: /add part/i })[0])
    const dialog = screen.getByRole('dialog')
    const tracking = within(dialog).getByRole('switch', { name: 'Track stock' })
    expect(tracking).toBeChecked()
    expect(within(dialog).getByLabelText('Quantity')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Min Qty')).toBeInTheDocument()

    await user.click(tracking)
    expect(within(dialog).queryByLabelText('Quantity')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Min Qty')).not.toBeInTheDocument()
    // What it costs the customer is still set here.
    expect(within(dialog).getByLabelText('Sell Price')).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('Name *'), 'Consumables fee')
    await user.click(within(dialog).getByRole('button', { name: 'Add Part' }))

    expect(createInventoryPart).toHaveBeenCalledTimes(1)
    expect(createInventoryPart.mock.calls[0][0]).toMatchObject({
      name: 'Consumables fee',
      trackStock: false,
      quantity: 0,
    })
  })

  it('opens an uncounted part with the switch off and says what turning it off does', async () => {
    const user = userEvent.setup()
    renderList([part({ id: 'supplies', name: 'Shop supplies', quantity: -40, minQuantity: 6 })])

    await user.click(rowOf('Shop supplies'))
    const dialog = screen.getByRole('dialog')
    const tracking = within(dialog).getByRole('switch', { name: 'Track stock' })
    expect(tracking).toBeChecked()

    await user.click(tracking)
    expect(within(dialog).getByText(/sets the quantity to zero/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    expect(updateInventoryPart.mock.calls[0][0]).toMatchObject({
      id: 'supplies',
      trackStock: false,
      quantity: 0,
      // Kept for the day tracking is switched back on.
      minQuantity: 6,
    })
  })
})
