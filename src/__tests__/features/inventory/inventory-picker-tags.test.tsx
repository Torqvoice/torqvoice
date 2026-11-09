/**
 * The stock picker on a work order and a quote, with tagged parts.
 *
 * The point of tagging a part with the makes and models it fits is that the
 * right one is at the top when a job for that vehicle is open, and that typing
 * a model finds it.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InventoryPickerDialog } from '@/features/vehicles/Components/service-edit/InventoryPickerDialog'
import type { InventoryPartOption } from '@/features/vehicles/Components/service-edit/form-types'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock('@/components/currency-settings-context', () => ({
  useFormatCurrency: () => (n: number) => `$${n.toFixed(2)}`,
}))

const part = (over: Partial<InventoryPartOption> & { id: string; name: string }) => ({
  partNumber: null,
  barcode: null,
  description: null,
  unit: null,
  unitCost: 10,
  sellPrice: 20,
  quantity: 3,
  category: null,
  tags: [],
  ...over,
})

// Alphabetical, the order the server sends them in.
const PARTS: InventoryPartOption[] = [
  part({ id: 'air', name: 'Air filter' }),
  part({ id: 'cabin', name: 'Cabin filter', tags: ['Ford Ranger'] }),
  part({ id: 'fuel', name: 'Fuel filter', tags: ['Toyota', 'Hilux 2015-2020'] }),
  part({ id: 'oil', name: 'Oil filter', tags: ['Toyota'] }),
]

function open(vehicle?: { make: string; model: string } | null) {
  const onSelectPart = vi.fn()
  render(
    <InventoryPickerDialog
      open
      onOpenChange={vi.fn()}
      inventoryParts={PARTS}
      currencyCode="AUD"
      onSelectPart={onSelectPart}
      vehicle={vehicle}
    />
  )
  return { onSelectPart }
}

/** The part names in the order the picker lists them. */
function listed(): string[] {
  const dialog = screen.getByRole('dialog')
  return within(dialog)
    .getAllByRole('button')
    .map((b) => b.querySelector('.font-medium')?.textContent ?? '')
    .filter((name) => name.endsWith('filter'))
}

describe('InventoryPickerDialog with tags', () => {
  it('lists parts tagged for the job’s model first, then its make, then the rest', () => {
    open({ make: 'Toyota', model: 'Hilux' })
    expect(listed()).toEqual(['Fuel filter', 'Oil filter', 'Air filter', 'Cabin filter'])
    expect(screen.getByText('fitsVehicleFirst:{"vehicle":"Toyota Hilux"}')).toBeInTheDocument()
  })

  it('keeps the plain order, and says nothing, when no part fits the vehicle', () => {
    open({ make: 'Volkswagen', model: 'Golf' })
    expect(listed()).toEqual(['Air filter', 'Cabin filter', 'Fuel filter', 'Oil filter'])
    expect(screen.queryByText(/fitsVehicleFirst/)).toBeNull()
  })

  it('keeps the plain order for a counter sale with no vehicle', () => {
    open(null)
    expect(listed()).toEqual(['Air filter', 'Cabin filter', 'Fuel filter', 'Oil filter'])
  })

  it('finds a part by a tag, and by a tag and its name together', async () => {
    open(null)
    const search = screen.getByPlaceholderText('searchInventory')
    await userEvent.type(search, 'ranger')
    expect(listed()).toEqual(['Cabin filter'])

    await userEvent.clear(search)
    await userEvent.type(search, 'filter hilux')
    expect(listed()).toEqual(['Fuel filter'])
  })

  it('shows a part’s tags on its row', () => {
    open({ make: 'Toyota', model: 'Hilux' })
    const fuelRow = screen.getByText('Fuel filter').closest('button')!
    expect(within(fuelRow).getByText('Hilux 2015-2020')).toBeInTheDocument()
    expect(within(fuelRow).getByText('Toyota')).toBeInTheDocument()
  })

  it('adds the picked part to the job linked to stock', async () => {
    const { onSelectPart } = open({ make: 'Toyota', model: 'Hilux' })
    await userEvent.click(screen.getByText('Fuel filter'))
    expect(onSelectPart).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fuel filter', inventoryPartId: 'fuel' })
    )
  })
})
