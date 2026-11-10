/**
 * Tests for the sell price that fills in on the inventory part form.
 *
 * Typing a cost fills in the sell price from the saved catalog markup. A price
 * that appears without being typed has to say where it came from, and it has
 * to be the cost plus a percentage: a workshop whose markup had been saved as
 * 30 rather than 1.3 saw a part that cost 10 fill in at 300 with nothing on
 * the form to explain it.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/components/glass-modal', () => ({
  useGlassModal: () => ({ open: vi.fn() }),
}))
vi.mock('@/hooks/use-native-camera', () => ({
  useNativeCamera: () => false,
}))
vi.mock('@/features/inventory/Actions/inventoryActions', () => ({
  createInventoryPart: vi.fn(),
  updateInventoryPart: vi.fn(),
  deleteOrphanedUploads: vi.fn(),
}))
vi.mock('@/features/inventory/Actions/aiAnalyzePartImage', () => ({
  aiAnalyzePartImage: vi.fn(),
}))

import { InventoryPartForm } from '@/features/inventory/Components/InventoryPartForm'
import { multiplierFromMarkupPercent } from '@/features/inventory/Lib/partPricing'

type FormProps = React.ComponentProps<typeof InventoryPartForm>

function renderForm(props: Partial<FormProps> = {}) {
  render(<InventoryPartForm open onOpenChange={vi.fn()} {...props} />)
  return {
    typeCost: (value: string) =>
      fireEvent.change(screen.getByLabelText('Unit Cost'), { target: { value } }),
    sellPrice: () => (screen.getByLabelText('Sell Price') as HTMLInputElement).value,
  }
}

const HINT = /Sell Price fills in at Unit Cost \+/

const savedPart: NonNullable<FormProps['part']> = {
  id: 'part-1',
  partNumber: 'BRK-001',
  barcode: null,
  name: 'Brake pad set',
  description: null,
  category: null,
  quantity: 4,
  minQuantity: 0,
  unit: 'pcs',
  unitCost: 10,
  sellPrice: 25,
  supplier: null,
  supplierPhone: null,
  supplierEmail: null,
  supplierUrl: null,
  imageUrl: null,
  gallery: [],
  location: null,
  tags: [],
}

describe('sell price on the inventory part form', () => {
  it('fills in at cost plus the markup the workshop applied as a percentage', () => {
    // What Apply Markup saves when 30 is typed into it.
    const form = renderForm({ markupMultiplier: multiplierFromMarkupPercent('30') ?? undefined })

    form.typeCost('10')
    expect(form.sellPrice()).toBe('13')

    form.typeCost('200')
    expect(form.sellPrice()).toBe('260')
  })

  it('says where the filled-in price comes from and where to change it', () => {
    renderForm({ markupMultiplier: 1.3 })

    expect(
      screen.getByText(
        'Sell Price fills in at Unit Cost + 30%. Type a price to set your own. To change the percentage, use Apply Markup on the Inventory page.'
      )
    ).toBeInTheDocument()
  })

  it('says nothing about a markup when none is applied', () => {
    const form = renderForm({ markupMultiplier: 1 })

    form.typeCost('10')
    expect(form.sellPrice()).toBe('10')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('leaves a price that was set by hand alone, and does not claim to fill it in', () => {
    const form = renderForm({ markupMultiplier: 1.3, part: savedPart })

    form.typeCost('40')
    expect(form.sellPrice()).toBe('25')
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })
})
