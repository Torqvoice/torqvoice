/**
 * Ticking parts in an inventory list that loads more as it scrolls.
 *
 * The header box takes the parts loaded so far and says how many, a bulk
 * delete never reaches one that has not loaded, ticks stay while more rows
 * arrive, and another filter starts with nothing ticked.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const deleteInventoryParts = vi.fn()
const getInventoryRows = vi.fn()
const confirm = vi.fn(async () => true)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/inventory',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => confirm }))
vi.mock('@/hooks/use-hardware-scanner', () => ({ useHardwareScanner: vi.fn() }))
vi.mock('@/hooks/use-remembered-sort', () => ({ useRememberedSort: vi.fn() }))
vi.mock('@/components/barcode-scanner-dialog', () => ({ BarcodeScannerDialog: () => null }))
vi.mock('@/features/inventory/Components/BarcodeScanActionDialog', () => ({
  BarcodeScanActionDialog: () => null,
}))
vi.mock('@/features/inventory/Components/InventoryPartForm', () => ({
  InventoryPartForm: () => null,
}))
vi.mock('@/features/inventory/Components/ApplyMarkupDialog', () => ({
  ApplyMarkupDialog: () => null,
}))
vi.mock('@/features/inventory/Actions/lookupPartByBarcode', () => ({
  lookupPartByBarcode: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/inventoryActions', () => ({
  deleteInventoryPart: vi.fn(),
  deleteInventoryParts: async (ids: string[]) => deleteInventoryParts(ids),
}))
vi.mock('@/features/inventory/Actions/getInventoryRows', () => ({
  getInventoryRows: (input: unknown) => getInventoryRows(input),
}))

import { InventoryClient } from '@/app/(authenticated)/inventory/inventory-client'

const observers: { callback: IntersectionObserverCallback; observer: IntersectionObserver }[] = []
class FakeObserver {
  constructor(public callback: IntersectionObserverCallback) {
    observers.push({ callback, observer: this as unknown as IntersectionObserver })
  }
  observe() {
    // The test says when the end is in sight.
  }
  unobserve() {
    // As above.
  }
  disconnect() {
    // As above.
  }
  takeRecords() {
    return []
  }
}
function endInSight() {
  act(() => {
    for (const { callback, observer } of observers) {
      callback([{ isIntersecting: true } as IntersectionObserverEntry], observer)
    }
  })
}

function part(i: number) {
  return {
    id: `p${i}`,
    partNumber: `PN-${i}`,
    barcode: null,
    name: `Part ${i}`,
    description: null,
    category: null,
    quantity: 10,
    minQuantity: 0,
    trackStock: true,
    unit: null,
    unitCost: 1,
    sellPrice: 2,
    supplier: null,
    supplierPhone: null,
    supplierEmail: null,
    supplierUrl: null,
    imageUrl: null,
    gallery: [],
    location: null,
    tags: [],
  }
}
// Small batches keep the render quick; the list does not care how big they are.
const all = Array.from({ length: 16 }, (_, i) => part(i + 1))
const firstBatch = { rows: all.slice(0, 10), nextCursor: { v: ['x'], id: 'p10' }, total: 16 }

let client: QueryClient
function list(category = '') {
  return (
    <QueryClientProvider client={client}>
      <InventoryClient
        data={firstBatch}
        listScope="org-1"
        search=""
        category={category}
        categories={['Filters']}
      />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  deleteInventoryParts.mockReset().mockResolvedValue({ success: true, data: { deleted: 0 } })
  getInventoryRows
    .mockReset()
    .mockResolvedValue({ success: true, data: { rows: all.slice(10), nextCursor: null } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  client.clear()
})

describe('selecting parts in the scrolling list', () => {
  it('deletes only the parts that were loaded and ticked, after more have loaded', async () => {
    render(list())
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 10 shown' }))
    expect(screen.getByText('10 parts selected')).toBeInTheDocument()

    endInSight()
    await waitFor(() => expect(screen.getAllByText('Part 16')).not.toHaveLength(0))
    // Still the ten; the six that arrived are not ticked.
    expect(screen.getByText('10 parts selected')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Select all 16 shown' })).toHaveAttribute(
      'data-state',
      'indeterminate'
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete (10)' }))
    })
    expect(deleteInventoryParts).toHaveBeenCalledWith(all.slice(0, 10).map((p) => p.id))
  })

  it('starts another filter with nothing selected', () => {
    const { rerender } = render(list())
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select Part 2' })[0])
    expect(screen.getByText('1 part selected')).toBeInTheDocument()

    rerender(list('Filters'))
    expect(screen.queryByText('1 part selected')).not.toBeInTheDocument()
  })
})
