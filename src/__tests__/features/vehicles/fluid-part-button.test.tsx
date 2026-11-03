import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { StockPart } from '@/features/integrations/Lib/fluid-stock'
import type { FluidSpec } from '@/features/integrations/Lib/types'
import { FluidPartButton } from '@/features/vehicles/Components/labor-guide/FluidPartButton'

vi.mock('@/components/currency-settings-context', () => ({
  useFormatCurrency: () => (n: number) => `${n.toFixed(2)} kr`,
}))

const OIL: FluidSpec = {
  id: 'engine_oil',
  system: 'Engine Oil',
  fluid: '0W-20 full synthetic',
  spec: 'API SP',
  capacityLiters: 5.7,
  capacityQuarts: 6,
  drainRefillLiters: 5.2,
  drainRefillQuarts: 5.5,
  intervalKm: null,
  intervalMiles: null,
  notes: null,
  confidence: 'high',
  locked: false,
}

function stockPart(id: string, name: string): StockPart {
  return { id, name, partNumber: null, unit: 'l', unitCost: 100, sellPrice: 189, quantity: 24 }
}

describe('FluidPartButton', () => {
  it('adds a plain line in one click when nothing in stock matches', () => {
    const onAdd = vi.fn()
    render(
      <FluidPartButton
        fluid={OIL}
        units="both"
        stock={{ parts: [stockPart('pads', 'Bremseklosser')] }}
        added={false}
        onAdd={onAdd}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add Engine Oil as a part' }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Engine Oil, 0W-20 full synthetic (API SP)',
        quantity: 5.2,
        unit: 'l',
        inventoryPartId: null,
      })
    )
  })

  it('offers the matching stock item with its price, stock and the amount it adds', () => {
    const onAdd = vi.fn()
    render(
      <FluidPartButton
        fluid={OIL}
        units="both"
        stock={{ parts: [stockPart('oil', 'Motorolje 0W-20')] }}
        added={false}
        onAdd={onAdd}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add Engine Oil as a part' }))
    expect(screen.getByText('Takes 5.2 L at a drain and refill')).toBeInTheDocument()
    expect(screen.getByText('From stock')).toBeInTheDocument()
    expect(screen.getByText(/189\.00 kr \/ l · 24 l in stock/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Motorolje 0W-20/ }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryPartId: 'oil', quantity: 5.2, unitPrice: 189 })
    )
  })

  it('still adds a plain line when the shop would rather not use stock', () => {
    const onAdd = vi.fn()
    render(
      <FluidPartButton
        fluid={OIL}
        units="us"
        stock={{ parts: [stockPart('oil', 'Motorolje 0W-20')] }}
        added={false}
        onAdd={onAdd}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Add Engine Oil as a part' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add without a stock item' }))
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ inventoryPartId: null, unit: 'qt', quantity: 5.49 })
    )
  })

  it('says when the fluid is already on the job', () => {
    render(<FluidPartButton fluid={OIL} units="both" added onAdd={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled()
  })
})
