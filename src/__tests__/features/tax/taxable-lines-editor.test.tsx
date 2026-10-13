/**
 * The editor's half of untaxed lines: the totals a work order shows while it
 * is typed, the switch on each line, and the row that says what the tax was
 * charged on.
 *
 * The server has the last word on what is stored (see the save tests), but
 * the screen has to agree with it before the save, or the desk reads one
 * total and the invoice prints another.
 */

import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LineTaxProvider } from '@/features/settings/Components/LineTaxContext'
import { LineTaxToggle } from '@/features/settings/Components/LineTaxToggle'
import { InvoiceSummary } from '@/features/vehicles/Components/service-detail/InvoiceSummary'
import { LaborEditor } from '@/features/vehicles/Components/service-edit/LaborEditor'
import { PartsEditor } from '@/features/vehicles/Components/service-edit/PartsEditor'
import { TotalsSection } from '@/features/vehicles/Components/service-edit/TotalsSection'
import { useServiceFormState } from '@/features/vehicles/Components/service-page/useServiceFormState'
import { useQuoteFormState } from '@/features/quotes/Components/useQuoteFormState'
import type { ServiceLaborInput, ServicePartInput } from '@/features/vehicles/Schema/serviceSchema'
import type { TaxApplies } from '@/lib/taxable-lines'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: vi.fn() }) }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))

const PARTS_ONLY: TaxApplies = { parts: true, labor: false, shopFee: false }
const ALL: TaxApplies = { parts: true, labor: true, shopFee: true }

const PART = {
  name: 'Pads',
  quantity: 1,
  unitPrice: 200,
  total: 200,
  unitCost: 0,
  markupPercent: 0,
}
const LABOR = { description: 'Fit', hours: 3, rate: 100, total: 300, pricingType: 'hourly' }
const FEE = { description: 'Supplies', hours: 1, rate: 20, total: 20, pricingType: 'shopFee' }

function workOrder(opts: {
  taxApplies?: TaxApplies
  partItems?: unknown[]
  laborItems?: unknown[]
  taxInclusive?: boolean
  discountType?: string
  discountValue?: number
}) {
  return renderHook(() =>
    useServiceFormState({
      vehicleId: null,
      initialData: {
        id: 'rec-1',
        title: 'Brakes',
        description: '',
        type: 'repair',
        status: 'pending',
        serviceDate: '2026-01-01',
        concerns: [],
        partItems: opts.partItems ?? [PART],
        laborItems: opts.laborItems ?? [LABOR],
        taxRate: 8,
        taxInclusive: opts.taxInclusive ?? false,
        discountType: opts.discountType,
        discountValue: opts.discountValue,
      } as never,
      defaultTaxRate: 8,
      currentUserName: 'Tester',
      record: { id: 'rec-1', payments: [], manuallyPaid: false, attachments: [] } as never,
      taxApplies: opts.taxApplies,
    })
  ).result.current
}

describe('the totals a work order shows while it is typed', () => {
  it('taxes everything when the workshop has no rule', () => {
    const form = workOrder({})
    expect(form.taxAmount).toBe(40)
    expect(form.totalAmount).toBe(540)
    expect(form.taxableShare).toBeNull()
  })

  it('taxes the parts alone where the workshop taxes only parts', () => {
    const form = workOrder({ taxApplies: PARTS_ONLY, laborItems: [LABOR, FEE] })
    expect(form.subtotal).toBe(520)
    expect(form.taxAmount).toBe(16)
    expect(form.totalAmount).toBe(536)
    expect(form.taxableShare).toEqual({
      parts: 200,
      labor: 0,
      subtotal: 200,
      taxableAmount: 200,
    })
  })

  it('follows a choice made on a line over the workshop rule', () => {
    const form = workOrder({
      taxApplies: PARTS_ONLY,
      partItems: [{ ...PART, taxable: false }],
      laborItems: [{ ...LABOR, taxable: true }],
    })
    expect(form.taxAmount).toBe(24)
    expect(form.totalAmount).toBe(524)
    expect(form.taxableShare).toMatchObject({ parts: 0, labor: 300, subtotal: 300 })
  })

  it('shares a discount over taxed and untaxed lines', () => {
    const form = workOrder({
      taxApplies: PARTS_ONLY,
      discountType: 'percentage',
      discountValue: 10,
    })
    expect(form.discountAmount).toBe(50)
    expect(form.taxAmount).toBe(14.4)
    expect(form.totalAmount).toBe(464.4)
    expect(form.taxableShare?.taxableAmount).toBe(180)
  })

  it('agrees with the server about a job saved with a stored choice', () => {
    // The same job the save test stores: 8% of 200, total 516.
    const form = workOrder({
      taxApplies: ALL,
      laborItems: [{ ...LABOR, taxable: false }],
    })
    expect(form.taxAmount).toBe(16)
    expect(form.totalAmount).toBe(516)
  })
})

describe('the totals a quote shows while it is typed', () => {
  const quote = (lines: { partItems: unknown[]; laborItems: unknown[] }, taxApplies?: TaxApplies) =>
    renderHook(() =>
      useQuoteFormState({
        quote: {
          id: 'q-1',
          status: 'draft',
          taxRate: 8,
          taxInclusive: false,
          customer: null,
          vehicle: null,
          attachments: [],
          ...lines,
        } as never,
        currencyCode: 'USD',
        defaultTaxRate: 8,
        taxEnabled: true,
        defaultLaborRate: 100,
        taxApplies,
        t: (key: string) => key,
      })
    ).result.current

  it('leaves out of the tax both the untaxed lines and the declined ones', () => {
    const state = quote(
      {
        partItems: [
          { id: 'p1', ...PART, partNumber: null },
          { id: 'p2', ...PART, partNumber: null, name: 'Rotors', total: 400, excluded: true },
        ],
        laborItems: [{ id: 'l1', ...LABOR }],
      },
      PARTS_ONLY
    )
    expect(state.subtotal).toBe(500)
    expect(state.taxAmount).toBe(16)
    expect(state.totalAmount).toBe(516)
    expect(state.taxableShare).toMatchObject({ parts: 200, labor: 0, subtotal: 200 })
  })

  it('keeps the choice stored on a line when the quote is opened', () => {
    const state = quote({
      partItems: [{ id: 'p1', ...PART, partNumber: null }],
      laborItems: [{ id: 'l1', ...LABOR, taxable: false }],
    })
    expect(state.laborItems[0].taxable).toBe(false)
    expect(state.partItems[0].taxable).toBeUndefined()
    expect(state.taxAmount).toBe(16)
  })

  it('taxes everything when the workshop has no rule', () => {
    const state = quote({
      partItems: [{ id: 'p1', ...PART, partNumber: null }],
      laborItems: [{ id: 'l1', ...LABOR }],
    })
    expect(state.taxAmount).toBe(40)
    expect(state.taxableShare).toBeNull()
  })
})

describe('the switch on a line', () => {
  const toggle = (selective: boolean, taxable: boolean, onToggle = vi.fn()) =>
    render(
      <LineTaxProvider value={{ selective, applies: ALL }}>
        <LineTaxToggle taxable={taxable} onToggle={onToggle} />
      </LineTaxProvider>
    )

  it('is not there at all for a workshop that taxes everything', () => {
    toggle(false, true)
    expect(screen.queryByTestId('line-tax-toggle')).toBeNull()
  })

  it('is there on every line for a workshop that taxes only some charges', () => {
    toggle(true, true)
    const button = screen.getByTestId('line-tax-toggle')
    expect(button).toHaveTextContent('TAX')
    expect(button).toHaveAttribute('aria-checked', 'true')
  })

  it('stays visible on an untaxed line after the setting is switched off', () => {
    // Otherwise a line left out of the tax could not be seen or undone.
    toggle(false, false)
    const button = screen.getByTestId('line-tax-toggle')
    expect(button).toHaveTextContent('NO TAX')
    expect(button).toHaveAttribute('aria-checked', 'false')
  })

  it('asks for the flip when clicked', () => {
    const onToggle = vi.fn()
    toggle(true, true, onToggle)
    fireEvent.click(screen.getByTestId('line-tax-toggle'))
    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})

describe('the line editors', () => {
  function Labor({ initial, applies }: { initial: ServiceLaborInput[]; applies: TaxApplies }) {
    const [items, setItems] = useState(initial)
    return (
      <TooltipProvider>
        <LineTaxProvider value={{ selective: true, applies }}>
          <LaborEditor
            laborItems={items}
            setLaborItems={setItems}
            updateLabor={vi.fn()}
            laborSubtotal={0}
            currencyCode="USD"
            defaultLaborRate={100}
          />
          <output data-testid="flags">{JSON.stringify(items.map((item) => item.taxable))}</output>
        </LineTaxProvider>
      </TooltipProvider>
    )
  }

  function Parts({ initial, applies }: { initial: ServicePartInput[]; applies: TaxApplies }) {
    const [items, setItems] = useState(initial)
    return (
      <TooltipProvider>
        <LineTaxProvider value={{ selective: true, applies }}>
          <PartsEditor
            partItems={items}
            setPartItems={setItems}
            updatePart={vi.fn()}
            partsSubtotal={0}
            currencyCode="USD"
            hasInventory={false}
            onOpenInventory={vi.fn()}
          />
          <output data-testid="flags">{JSON.stringify(items.map((item) => item.taxable))}</output>
        </LineTaxProvider>
      </TooltipProvider>
    )
  }

  it('shows a labor line as untaxed where the workshop does not tax labor, and flips it', () => {
    render(<Labor initial={[LABOR as ServiceLaborInput]} applies={PARTS_ONLY} />)
    const button = screen.getByTestId('line-tax-toggle')
    expect(button).toHaveAttribute('data-taxable', 'false')
    // Nothing chosen yet: the line follows the rule.
    expect(screen.getByTestId('flags')).toHaveTextContent('[null]')

    fireEvent.click(button)
    expect(screen.getByTestId('flags')).toHaveTextContent('[true]')
    expect(screen.getByTestId('line-tax-toggle')).toHaveAttribute('data-taxable', 'true')

    fireEvent.click(screen.getByTestId('line-tax-toggle'))
    expect(screen.getByTestId('flags')).toHaveTextContent('[false]')
  })

  it('shows a shop fee by the rule for the fee, not the rule for labor', () => {
    render(
      <Labor
        initial={[LABOR as ServiceLaborInput, FEE as ServiceLaborInput]}
        applies={{ parts: true, labor: false, shopFee: true }}
      />
    )
    expect(
      screen.getAllByTestId('line-tax-toggle').map((el) => el.getAttribute('data-taxable'))
    ).toEqual(['false', 'true'])
  })

  it('shows a part as taxed where the workshop taxes parts, and flips it', () => {
    render(<Parts initial={[PART as ServicePartInput]} applies={PARTS_ONLY} />)
    const button = screen.getByTestId('line-tax-toggle')
    expect(button).toHaveAttribute('data-taxable', 'true')

    fireEvent.click(button)
    expect(screen.getByTestId('flags')).toHaveTextContent('[false]')
    expect(screen.getByTestId('line-tax-toggle')).toHaveAttribute('data-taxable', 'false')
  })
})

describe('the row that says what the tax was charged on', () => {
  const totals = (taxableShare: Parameters<typeof TotalsSection>[0]['taxableShare']) =>
    render(
      <TotalsSection
        partsSubtotal={200}
        partsCostSubtotal={0}
        laborSubtotal={300}
        subtotal={500}
        discountType="none"
        setDiscountType={vi.fn()}
        discountValue={0}
        setDiscountValue={vi.fn()}
        discountAmount={0}
        taxEnabled
        taxRate={8}
        setTaxRate={vi.fn()}
        taxAmount={taxableShare ? 16 : 40}
        taxInclusive={false}
        taxableShare={taxableShare}
        totalAmount={taxableShare ? 516 : 540}
        currencyCode="USD"
      />
    )

  it('is on the totals card when a line is left out of the tax', () => {
    totals({ parts: 200, labor: 0, subtotal: 200, taxableAmount: 200 })
    const row = screen.getByTestId('taxable-amount-row')
    expect(row).toHaveTextContent('Taxable amount')
    expect(row).toHaveTextContent('200.00')
  })

  it('is not there when every line is taxed', () => {
    totals(null)
    expect(screen.queryByTestId('taxable-amount-row')).toBeNull()
  })

  it('is on the invoice summary too, and the summary takes tax out of taxed lines only', () => {
    render(
      <InvoiceSummary
        hasPartItems
        hasLaborItems
        // Prices entered with tax in them: 216 of taxed parts, 300 of untaxed labor.
        partsSubtotal={216}
        laborSubtotal={300}
        subtotal={516}
        discountAmount={0}
        discountType={null}
        discountValue={0}
        taxRate={8}
        taxAmount={16}
        taxInclusive
        taxableShare={{ parts: 216, labor: 0, subtotal: 216, taxableAmount: 200 }}
        displayTotal={516}
        totalPaid={0}
        balanceDue={516}
        hasPayments={false}
        currencyCode="USD"
      />
    )
    expect(screen.getByTestId('taxable-amount-row')).toHaveTextContent('200.00')
    // Labor reads 300, not 277.78: there was never any tax in it.
    expect(screen.getByText('Labor').parentElement).toHaveTextContent('300.00')
    expect(screen.getByText('Parts').parentElement).toHaveTextContent('200.00')
    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent('500.00')
  })
})
