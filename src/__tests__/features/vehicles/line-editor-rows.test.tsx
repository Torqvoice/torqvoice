/**
 * The rows of the labour and parts editors.
 *
 * A work order with twenty lines used to draw all twenty again for every
 * character typed into one of them, which is most of why the page answered
 * slowly. A row is now drawn again only when its own line changes, and its
 * buttons name the line by its place in the list. So: the right line still
 * goes when one is deleted, typing after that still lands in the line under
 * the cursor, and the other lines are left alone while one is typed in.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LaborEditor } from '@/features/vehicles/Components/service-edit/LaborEditor'
import { PartsEditor } from '@/features/vehicles/Components/service-edit/PartsEditor'
import type { ServiceLaborInput, ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'

// Every row draws one drag handle, so this counts how often rows are drawn.
const drawn = vi.hoisted(() => ({ rows: 0 }))
const openInventory = vi.fn()
vi.mock('@/components/line-drag-handle', () => ({
  LineDragHandle: () => {
    drawn.rows += 1
    return null
  },
}))

const labor = (description: string): ServiceLaborInput => ({
  description,
  hours: 1,
  rate: 100,
  total: 100,
  pricingType: 'hourly',
})
const part = (name: string): ServicePartInput => ({
  name,
  partNumber: '',
  quantity: 1,
  unitPrice: 10,
  total: 10,
  unitCost: 0,
  markupPercent: 0,
})

function LaborHarness() {
  const [items, setItems] = useState([labor('Brakes'), labor('Oil change'), labor('Alignment')])
  const update = useCallback(
    (index: number, field: keyof ServiceLaborInput, value: string | number) =>
      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))),
    []
  )
  return (
    <TooltipProvider>
      <LaborEditor
        laborItems={items}
        setLaborItems={setItems}
        updateLabor={update}
        laborSubtotal={0}
        currencyCode="USD"
        defaultLaborRate={100}
      />
    </TooltipProvider>
  )
}

function PartsHarness() {
  const [items, setItems] = useState([part('Pads'), part('Filter'), part('Wiper')])
  const update = useCallback(
    (index: number, field: keyof ServicePartInput, value: string | number) =>
      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))),
    []
  )
  return (
    <TooltipProvider>
      <PartsEditor
        partItems={items}
        setPartItems={setItems}
        updatePart={update}
        partsSubtotal={0}
        currencyCode="USD"
        hasInventory={false}
        onOpenInventory={openInventory}
      />
    </TooltipProvider>
  )
}

const descriptions = () =>
  screen.getAllByPlaceholderText('Description *').map((el) => (el as HTMLTextAreaElement).value)
const names = () =>
  screen.getAllByPlaceholderText('Name *').map((el) => (el as HTMLTextAreaElement).value)

beforeEach(() => {
  drawn.rows = 0
})

describe('labour lines', () => {
  it('deletes the line whose button was pressed', () => {
    render(<LaborHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete row' })[1])
    expect(descriptions()).toEqual(['Brakes', 'Alignment'])
  })

  it('types into the line under the cursor after one above it is deleted', () => {
    render(<LaborHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete row' })[0])
    fireEvent.change(screen.getAllByPlaceholderText('Description *')[1], {
      target: { value: 'Alignment, four wheels' },
    })
    expect(descriptions()).toEqual(['Oil change', 'Alignment, four wheels'])
  })

  it('draws only the line being typed in', () => {
    render(<LaborHarness />)
    drawn.rows = 0
    fireEvent.change(screen.getAllByPlaceholderText('Description *')[0], {
      target: { value: 'Brakes, front' },
    })
    expect(descriptions()).toEqual(['Brakes, front', 'Oil change', 'Alignment'])
    expect(drawn.rows).toBe(1)
  })
})

describe('part lines', () => {
  it('deletes the line whose button was pressed', () => {
    render(<PartsHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete row' })[1])
    expect(names()).toEqual(['Pads', 'Wiper'])
  })

  it('types into the line under the cursor after one above it is deleted', () => {
    render(<PartsHarness />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete row' })[0])
    fireEvent.change(screen.getAllByPlaceholderText('Name *')[1], {
      target: { value: 'Wiper blade' },
    })
    expect(names()).toEqual(['Filter', 'Wiper blade'])
  })

  it('draws only the line being typed in', () => {
    render(<PartsHarness />)
    drawn.rows = 0
    fireEvent.change(screen.getAllByPlaceholderText('Name *')[0], {
      target: { value: 'Pads, front' },
    })
    expect(names()).toEqual(['Pads, front', 'Filter', 'Wiper'])
    expect(drawn.rows).toBe(1)
  })
})
