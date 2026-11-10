/**
 * Tests for how the inventory list ties Apply Markup to the Add Part form.
 *
 * Two things went wrong here that no test of either piece alone would catch.
 * The form used to price a new part with whatever was sitting in the markup
 * dialog, so a number typed there and then cancelled still set the price. And
 * a markup that had just been applied only reached the form once the page had
 * been read again, so a part added straight away filled in at the old one.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const applyMarkupToAll = vi.fn()
const setSetting = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
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
  applyMarkupToAll: (...args: unknown[]) => applyMarkupToAll(...args),
  createInventoryPart: vi.fn(),
  updateInventoryPart: vi.fn(),
  deleteInventoryPart: vi.fn(),
  deleteInventoryParts: vi.fn(),
  deleteOrphanedUploads: vi.fn(),
}))
vi.mock('@/features/settings/Actions/settingsActions', () => ({
  setSetting: (...args: unknown[]) => setSetting(...args),
}))

import { InventoryClient } from '@/app/(authenticated)/inventory/inventory-client'

const emptyList = { parts: [], total: 0, page: 1, pageSize: 25, totalPages: 0 }

function renderList(props: Partial<React.ComponentProps<typeof InventoryClient>> = {}) {
  render(<InventoryClient data={emptyList} search="" category="" categories={[]} {...props} />)
}

/** Opens Apply Markup, types a percentage and presses the named button. */
async function markup(
  user: ReturnType<typeof userEvent.setup>,
  percent: string,
  button: 'Apply' | 'Cancel'
) {
  await user.click(screen.getByRole('button', { name: 'Apply Markup' }))
  const dialog = screen.getByRole('dialog')
  const field = within(dialog).getByLabelText('Markup %')
  const openedWith = (field as HTMLInputElement).value
  await user.clear(field)
  await user.type(field, percent)
  await user.click(within(dialog).getByRole('button', { name: button }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  return openedWith
}

/** Opens Add Part, types a cost and reads the sell price that fills in. */
async function sellPriceForCost(user: ReturnType<typeof userEvent.setup>, cost: string) {
  await user.click(screen.getAllByRole('button', { name: /add part/i })[0])
  const dialog = screen.getByRole('dialog')
  fireEvent.change(within(dialog).getByLabelText('Unit Cost'), { target: { value: cost } })
  const sell = (within(dialog).getByLabelText('Sell Price') as HTMLInputElement).value
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  return sell
}

beforeEach(() => {
  applyMarkupToAll.mockReset().mockResolvedValue({ success: true, data: { updated: 0 } })
  setSetting.mockReset().mockResolvedValue({ success: true })
  refresh.mockReset()
})

describe('markup on the inventory list', () => {
  it('prices a new part at cost plus the saved markup', async () => {
    const user = userEvent.setup()
    renderList({ markupMultiplier: 1.3, applyMarkupPercent: 30 })

    expect(await sellPriceForCost(user, '10')).toBe('13')
  })

  it('prices the very next part with a markup that was just applied', async () => {
    const user = userEvent.setup()
    // Nothing saved yet. The page is not read again in this test, exactly as
    // it has not been yet in the moment after Apply is pressed.
    renderList({ markupMultiplier: 1, applyMarkupPercent: 0 })

    await markup(user, '30', 'Apply')

    expect(applyMarkupToAll).toHaveBeenCalledWith({ multiplier: 1.3, overrideExisting: false })
    expect(refresh).toHaveBeenCalled()
    expect(await sellPriceForCost(user, '10')).toBe('13')
  })

  it('opens the dialog again on the markup that was just applied', async () => {
    const user = userEvent.setup()
    renderList({ markupMultiplier: 1, applyMarkupPercent: 0 })

    await markup(user, '30', 'Apply')

    expect(await markup(user, '45', 'Cancel')).toBe('30')
  })

  it('does not price a part with a markup that was typed and then cancelled', async () => {
    const user = userEvent.setup()
    renderList({ markupMultiplier: 1.3, applyMarkupPercent: 30 })

    await markup(user, '300', 'Cancel')

    expect(applyMarkupToAll).not.toHaveBeenCalled()
    expect(await sellPriceForCost(user, '10')).toBe('13')
  })

  it("offers the workshop's Default Markup % the first time the dialog is opened", async () => {
    const user = userEvent.setup()
    // What the page passes when no catalog markup was ever saved and
    // Settings > Workshop has Default Markup % at 30.
    renderList({ markupMultiplier: 1, applyMarkupPercent: 30 })

    expect(await markup(user, '30', 'Cancel')).toBe('30')
    // Offered, not applied: until Apply is pressed a new part still fills in at cost.
    expect(await sellPriceForCost(user, '10')).toBe('10')
  })
})
