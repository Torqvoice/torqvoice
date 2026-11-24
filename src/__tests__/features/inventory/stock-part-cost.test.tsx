/**
 * A part taken from stock keeps what the workshop paid for it.
 *
 * Picked from inventory, a part bought at 6.40 and sold at 12.50 used to land
 * on the line at a markup of 0, and one brought in by a labour preset at a
 * cost of 0, so the job and the reports showed no parts cost and no profit.
 * The row now shows the item's cost and the markup its price implies, the
 * same markup the row would work out itself, and those are what get saved.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { costFieldsForPrice } from '@/features/inventory/Lib/partPricing'
import { QuotePartsEditor } from '@/features/quotes/Components/QuotePartsEditor'
import type { QuotePartInput } from '@/features/quotes/Schema/quoteSchema'
import { quotePartSchema } from '@/features/quotes/Schema/quoteSchema'
import { InventoryPickerDialog } from '@/features/vehicles/Components/service-edit/InventoryPickerDialog'
import { PartsEditor } from '@/features/vehicles/Components/service-edit/PartsEditor'
import type { InventoryPartOption } from '@/features/vehicles/Components/service-edit/form-types'
import { type ServicePartInput, servicePartSchema } from '@/features/vehicles/Schema/serviceSchema'

const WIPER: InventoryPartOption = {
  id: 'inv-wiper',
  name: 'Wiper blade',
  partNumber: 'WB-500',
  barcode: null,
  description: null,
  unit: null,
  unitCost: 6.4,
  sellPrice: 12.5,
  quantity: 8,
  category: null,
  tags: [],
}

/** The work order's parts card with its stock picker, as the page wires them. */
function WorkOrderParts({ onChange }: { onChange: (rows: ServicePartInput[]) => void }) {
  const [rows, setRows] = useState<ServicePartInput[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  onChange(rows)
  const update = useCallback(
    (index: number, field: keyof ServicePartInput, value: string | number) =>
      setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))),
    []
  )
  return (
    <TooltipProvider>
      <PartsEditor
        partItems={rows}
        setPartItems={setRows}
        updatePart={update}
        partsSubtotal={0}
        currencyCode="GBP"
        hasInventory
        onOpenInventory={() => setPickerOpen(true)}
      />
      <InventoryPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        inventoryParts={[WIPER]}
        currencyCode="GBP"
        onSelectPart={(part) => setRows((prev) => [part, ...prev])}
      />
    </TooltipProvider>
  )
}

const pickWiper = () => {
  const dialog = screen.getByRole('dialog')
  fireEvent.click(within(dialog).getByText('Wiper blade', { exact: false }))
}

describe('a part picked from inventory on a work order', () => {
  it('shows the item cost and the markup its sell price implies', () => {
    let rows: ServicePartInput[] = []
    render(<WorkOrderParts onChange={(r) => (rows = r)} />)

    fireEvent.click(screen.getByRole('button', { name: 'From Inventory' }))
    pickWiper()

    expect(screen.getByPlaceholderText('Cost')).toHaveValue(6.4)
    expect(screen.getByPlaceholderText('Markup %')).toHaveValue(95.3)
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()

    // What the save sends: the cost and markup survive the schema.
    expect(servicePartSchema.parse(rows[0])).toMatchObject({
      unitCost: 6.4,
      markupPercent: 95.3,
      unitPrice: 12.5,
      total: 12.5,
      inventoryPartId: 'inv-wiper',
    })
  })
})

describe('a part picked from inventory on a quote', () => {
  it('arrives with the item cost and its markup, and shows them on the row', () => {
    const onAddBulk = vi.fn()
    const t = (key: string) => key
    const { unmount } = render(
      <QuotePartsEditor
        partItems={[]}
        currencyCode="GBP"
        partsSubtotal={0}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onAddBulk={onAddBulk}
        inventoryParts={[WIPER]}
        t={t}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /parts\.addFromInventory/ }))
    pickWiper()

    const [added] = onAddBulk.mock.calls[0][0] as QuotePartInput[]
    expect(quotePartSchema.parse(added)).toMatchObject({
      unitCost: 6.4,
      markupPercent: 95.3,
      unitPrice: 12.5,
      inventoryPartId: 'inv-wiper',
    })
    unmount()

    render(
      <QuotePartsEditor
        partItems={[added]}
        currencyCode="GBP"
        partsSubtotal={12.5}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        t={t}
      />
    )
    expect(screen.getByDisplayValue('6.4')).toBeInTheDocument()
    expect(screen.getByDisplayValue('95.3')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12.5')).toBeInTheDocument()
  })
})

describe('a part brought in by a labour preset', () => {
  it('carries the linked stock cost under the preset price', () => {
    expect(costFieldsForPrice(6.4, 12.5)).toEqual({
      unitCost: 6.4,
      markupPercent: 95.3,
      priceOverridden: false,
    })
  })

  it('keeps a price the rounded markup cannot rebuild as the preset set it', () => {
    // 133.37 over 100 is 33.37%, held to 33.4%, which would make it 133.40.
    expect(costFieldsForPrice(100, 133.37)).toEqual({
      unitCost: 100,
      markupPercent: 33.4,
      priceOverridden: true,
    })
  })

  it('has no cost and no markup when the part is not linked to stock', () => {
    expect(costFieldsForPrice(undefined, 25)).toEqual({
      unitCost: 0,
      markupPercent: 0,
      priceOverridden: true,
    })
  })
})
