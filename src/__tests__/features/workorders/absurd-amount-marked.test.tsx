/**
 * An absurd amount on the work order is marked where it was typed.
 *
 * A quantity of 1,000,000,000 at £99,999,999 was refused only by a toast:
 * the figure stayed in its box with nothing to say which, and the totals
 * ran out of the side card and the bar along the bottom. Now the figure is
 * red with the limit under it as it is typed, the save puts the cursor on
 * it, and the totals stay inside their containers.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { useCallback, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LINE_ERROR_SELECTOR } from '@/components/field-errors'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LaborEditor } from '@/features/vehicles/Components/service-edit/LaborEditor'
import { PartsEditor } from '@/features/vehicles/Components/service-edit/PartsEditor'
import { MoneyBar } from '@/features/vehicles/Components/service-page/modern/MoneyBar'
import type { ServiceLaborInput, ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import { laborLineIssues, partLineIssues } from '@/lib/input-limits'

vi.mock('@/components/line-drag-handle', () => ({ LineDragHandle: () => null }))

const part = (over: Partial<ServicePartInput> = {}): ServicePartInput => ({
  name: 'Brake pads',
  partNumber: '',
  quantity: 1,
  unitPrice: 100,
  total: 100,
  unitCost: 0,
  markupPercent: 0,
  ...over,
})

function PartsHarness({ initial }: { initial: ServicePartInput[] }) {
  const [items, setItems] = useState(initial)
  const update = useCallback(
    (index: number, field: keyof ServicePartInput, value: string | number) =>
      setItems((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))),
    []
  )
  return (
    <TooltipProvider>
      <form data-testid="work-order">
        <PartsEditor
          partItems={items}
          setPartItems={setItems}
          updatePart={update}
          partsSubtotal={0}
          currencyCode="GBP"
          hasInventory={false}
          onOpenInventory={vi.fn()}
        />
      </form>
    </TooltipProvider>
  )
}

describe('the figures a save would refuse', () => {
  it('are found field by field, with the limit each passed', () => {
    expect(
      partLineIssues({ name: 'Pads', quantity: 1_000_000_000, unitPrice: 99_999_999 })
    ).toEqual({
      quantity: { issue: 'tooLarge', limit: 100_000 },
      unitPrice: { issue: 'tooLarge', limit: 10_000_000 },
      total: { issue: 'tooLarge', limit: 1_000_000_000 },
    })
    expect(partLineIssues({ name: 'Pads', quantity: 0, unitPrice: 10 })).toEqual({
      quantity: { issue: 'positive' },
    })
    expect(partLineIssues({ name: 'Pads', quantity: 0, unitPrice: 0 })).toEqual({})
    expect(partLineIssues({ name: 'Pads', quantity: -2, unitPrice: 10 })).toEqual({
      quantity: { issue: 'negative' },
    })
    expect(laborLineIssues({ hours: 0, rate: 100 })).toEqual({})
    expect(laborLineIssues({ hours: 100_000, rate: 10_001 })).toEqual({
      total: { issue: 'tooLarge', limit: 1_000_000_000 },
    })
  })
})

describe('a part line on the work order', () => {
  it('marks a billion parts at £99,999,999 under each field as it is typed', () => {
    render(<PartsHarness initial={[part()]} />)
    const quantity = screen.getByDisplayValue('1')
    fireEvent.change(quantity, { target: { value: '1000000000' } })
    fireEvent.change(screen.getByDisplayValue('100'), { target: { value: '99999999' } })

    expect(quantity).toHaveAttribute('aria-invalid', 'true')
    expect(quantity).toHaveAccessibleDescription('Must be 100,000 or less.')
    expect(screen.getByDisplayValue('99999999')).toHaveAccessibleDescription(
      'Must be 10,000,000 or less.'
    )
    expect(screen.getByText('Must be 1,000,000,000 or less.')).toBeInTheDocument()
  })

  it('is where the save puts the cursor', () => {
    render(<PartsHarness initial={[part(), part({ name: 'Disc', quantity: 1_000_000 })]} />)
    const form = screen.getByTestId('work-order') as HTMLFormElement
    form.querySelector<HTMLElement>(LINE_ERROR_SELECTOR)?.focus()
    expect(screen.getByDisplayValue('1000000')).toHaveFocus()
  })

  it('clears the mark once the figure is put right', () => {
    render(<PartsHarness initial={[part({ quantity: 1_000_000 })]} />)
    fireEvent.change(screen.getByDisplayValue('1000000'), { target: { value: '4' } })
    expect(screen.getByDisplayValue('4')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText(/or less/)).not.toBeInTheDocument()
  })

  it('marks a priced part at zero and leaves a free one alone', () => {
    const { unmount } = render(<PartsHarness initial={[part({ quantity: 0, total: 0 })]} />)
    expect(screen.getByText('Must be more than 0.')).toBeInTheDocument()
    unmount()
    render(<PartsHarness initial={[part({ quantity: 0, unitPrice: 0, total: 0 })]} />)
    expect(screen.queryByText('Must be more than 0.')).not.toBeInTheDocument()
  })
})

describe('a labour line on the work order', () => {
  const labor = (over: Partial<ServiceLaborInput>): ServiceLaborInput => ({
    description: 'Diagnose',
    hours: 1,
    rate: 100,
    total: 100,
    pricingType: 'hourly',
    ...over,
  })
  const renderLabor = (line: ServiceLaborInput) =>
    render(
      <TooltipProvider>
        <LaborEditor
          laborItems={[line]}
          setLaborItems={vi.fn()}
          updateLabor={vi.fn()}
          laborSubtotal={0}
          currencyCode="GBP"
          defaultLaborRate={100}
        />
      </TooltipProvider>
    )

  it('marks absurd hours', () => {
    renderLabor(labor({ hours: 2_000_000 }))
    expect(screen.getByDisplayValue('2000000')).toHaveAccessibleDescription(
      'Must be 100,000 or less.'
    )
  })

  it('keeps a line with no hours yet unmarked', () => {
    renderLabor(labor({ hours: 0, total: 0 }))
    expect(screen.queryByText(/or less|more than 0/)).not.toBeInTheDocument()
  })
})

describe('the bar along the bottom', () => {
  it('keeps an absurd balance whole on hover while it is cut short on the bar', () => {
    render(
      <MoneyBar
        total={119_999_998_800_000_000}
        paid={0}
        balance={119_999_998_800_000_000}
        currencyCode="GBP"
        onTakePayment={vi.fn()}
        onPreview={vi.fn()}
        onSend={vi.fn()}
      />
    )
    const balance = screen.getByTestId('money-balance')
    expect(balance).toHaveClass('truncate')
    expect(balance.getAttribute('title')).toBe(balance.textContent)
    // The buttons stay on the bar.
    expect(screen.getByRole('button', { name: /take payment/i })).toBeInTheDocument()
  })
})
