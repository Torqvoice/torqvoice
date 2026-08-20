/**
 * Tests for the inline part-name typeahead shown in the work order and quote
 * parts editors.
 *
 * The value of this feature is that it links a line to stock. A line typed by
 * hand stays unlinked, and an unlinked line never deducts inventory when the
 * job is saved, so the suggestion has to surface the right part early and
 * apply the inventory id when picked.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  PartNameSuggestions,
  type PartSuggestion,
} from '@/features/inventory/Components/PartNameSuggestions'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}))

vi.mock('@/components/currency-settings-context', () => ({
  useFormatCurrency: () => (n: number) => `$${n.toFixed(2)}`,
}))

const PARTS: PartSuggestion[] = [
  {
    id: 'p1',
    name: 'Brake pad front',
    partNumber: 'BP-1',
    unitCost: 10,
    sellPrice: 25,
    quantity: 4,
  },
  { id: 'p2', name: 'Brake disc', partNumber: 'BD-9', unitCost: 30, sellPrice: 70, quantity: 2 },
  { id: 'p3', name: 'Oil filter', partNumber: 'OF-2', unitCost: 4, sellPrice: 12, quantity: 9 },
  { id: 'p4', name: 'Brake fluid', partNumber: 'BF-3', unitCost: 5, sellPrice: 14, quantity: 6 },
  { id: 'p5', name: 'Brake cable', partNumber: 'BC-7', unitCost: 8, sellPrice: 20, quantity: 1 },
]

function setup(
  query: string,
  over: Partial<React.ComponentProps<typeof PartNameSuggestions>> = {}
) {
  const onSelect = vi.fn()
  render(<PartNameSuggestions query={query} parts={PARTS} onSelect={onSelect} {...over} />)
  return { onSelect }
}

/** Names of the rendered suggestion buttons, in order. */
function shown() {
  return screen.queryAllByRole('button').map((b) => b.textContent ?? '')
}

describe('PartNameSuggestions', () => {
  it('shows nothing until enough has been typed', () => {
    setup('b')
    expect(shown()).toHaveLength(0)
  })

  it('shows nothing for an empty field', () => {
    setup('')
    expect(shown()).toHaveLength(0)
  })

  it('matches on name and caps the list at three', () => {
    setup('brake')
    // Four parts match "brake"; only three may render.
    expect(shown()).toHaveLength(3)
  })

  it('matches on part number too', () => {
    setup('of-2')
    expect(shown()).toHaveLength(1)
    expect(shown()[0]).toContain('Oil filter')
  })

  it('is case insensitive', () => {
    setup('BRAKE PAD')
    expect(shown()[0]).toContain('Brake pad front')
  })

  it('ranks an exact part-number hit first', () => {
    setup('bd-9')
    expect(shown()[0]).toContain('Brake disc')
  })

  it('ranks a name prefix above a mid-string match', () => {
    // "filter" appears only inside "Oil filter", so a prefix beats it.
    setup('oil')
    expect(shown()[0]).toContain('Oil filter')
  })

  it('shows nothing when the row is already linked to stock', () => {
    setup('brake', { disabled: true })
    expect(shown()).toHaveLength(0)
  })

  it('hides once the name exactly matches the only suggestion', () => {
    // The row already holds this part; re-offering it is noise.
    setup('oil filter')
    expect(shown()).toHaveLength(0)
  })

  it('passes the whole part back when picked, including the stock id', async () => {
    const user = userEvent.setup()
    const { onSelect } = setup('oil')
    await user.click(screen.getAllByRole('button')[0])
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p3', name: 'Oil filter', sellPrice: 12 })
    )
  })

  it('shows stock level and price so the right part can be told apart', () => {
    setup('oil')
    expect(shown()[0]).toContain('9')
    expect(shown()[0]).toContain('$12.00')
  })

  it('shows the price that will actually be applied, not a raw zero', () => {
    // A part with no sell price is billed at cost. Showing $0.00 here
    // contradicted what landed on the line.
    const noSell: PartSuggestion[] = [
      { id: 'z', name: 'Zero priced', partNumber: null, unitCost: 18, sellPrice: 0, quantity: 3 },
    ]
    render(<PartNameSuggestions query="zero" parts={noSell} onSelect={vi.fn()} />)
    expect(shown()[0]).toContain('$18.00')
    expect(shown()[0]).not.toContain('$0.00')
  })

  it('shows the marked-up price when the workshop marks up inventory', () => {
    const p: PartSuggestion[] = [
      { id: 'm', name: 'Marked up', partNumber: null, unitCost: 10, sellPrice: 25, quantity: 2 },
    ]
    render(
      <PartNameSuggestions
        query="marked"
        parts={p}
        onSelect={vi.fn()}
        markupAppliesToInventory
        defaultMarkupPercent={40}
      />
    )
    expect(shown()[0]).toContain('$14.00')
  })

  it('flags out of stock and backordered parts like the picker does', () => {
    const p: PartSuggestion[] = [
      { id: 'o', name: 'Outta stock', partNumber: null, unitCost: 5, sellPrice: 9, quantity: 0 },
      {
        id: 'b',
        name: 'Outstanding backorder',
        partNumber: null,
        unitCost: 5,
        sellPrice: 9,
        quantity: -3,
      },
    ]
    render(<PartNameSuggestions query="out" parts={p} onSelect={vi.fn()} />)
    const text = shown().join(' ')
    expect(text).toContain('suggestions.outOfStock')
    expect(text).toContain('suggestions.onBackorder')
  })

  it('exposes the full name as a tooltip for names that still overflow', () => {
    const long: PartSuggestion[] = [
      {
        id: 'long',
        name: 'Brake pad set front axle ceramic low-dust OEM equivalent',
        partNumber: 'BP-LONG-1',
        unitCost: 10,
        sellPrice: 40,
        quantity: 3,
      },
    ]
    render(<PartNameSuggestions query="brake" parts={long} onSelect={vi.fn()} />)
    expect(screen.getByTitle(long[0].name)).toBeTruthy()
  })

  it('can be reached by keyboard and picked with Enter', async () => {
    // onMouseDown alone never fires for keyboard activation, so tabbing to a
    // suggestion and pressing Enter used to do nothing at all.
    const user = userEvent.setup()
    const { onSelect } = setup('oil')
    await user.tab()
    expect(document.activeElement).toBe(screen.getAllByRole('button')[0])
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p3' }))
  })

  it('can be picked with Space', async () => {
    const user = userEvent.setup()
    const { onSelect } = setup('oil')
    await user.tab()
    await user.keyboard(' ')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'p3' }))
  })

  it('renders nothing when the inventory is empty', () => {
    render(<PartNameSuggestions query="brake" parts={[]} onSelect={vi.fn()} />)
    expect(shown()).toHaveLength(0)
  })
})
