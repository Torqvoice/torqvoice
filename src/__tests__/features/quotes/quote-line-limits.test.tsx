/**
 * A quote's lines follow the work order's rules, since a quote becomes one.
 *
 * A quote took a quantity of a billion at a hundred million each, and a
 * priced part at a quantity of zero, which a work order refuses. Now the
 * quote's schema refuses them too, the editor marks the figure under its
 * field as it is typed, and the save says why in the work order's words.
 * What a work order allows stays allowed: a free part at zero, labour at
 * zero hours. A quote saved before the rules still converts as it is.
 */
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/features/inventory/Lib/reconcileStock', () => ({
  reconcileInventoryForParts: vi.fn(),
}))

import { QuoteLaborEditor } from '@/features/quotes/Components/QuoteLaborEditor'
import { QuotePartsEditor } from '@/features/quotes/Components/QuotePartsEditor'
import type { QuoteLaborInput, QuotePartInput } from '@/features/quotes/Components/quote-page-types'
import { copyQuoteLaborToJob, copyQuotePartsToJob } from '@/features/quotes/Lib/copyQuoteToJob'
import { findQuoteLineProblem } from '@/features/quotes/Lib/validateQuoteLines'
import {
  quoteLaborSchema,
  quotePartSchema,
  updateQuoteSchema,
} from '@/features/quotes/Schema/quoteSchema'
import { fieldErrorsFromZod } from '@/lib/field-errors'

const part = { name: 'Brake pads', quantity: 1, unitPrice: 100, total: 100 }
const labor = { description: 'Fit pads', hours: 1, rate: 100, total: 100 }

describe('a quote line on save', () => {
  it('refuses a billion parts at a hundred million each', () => {
    const result = quotePartSchema.safeParse({
      ...part,
      quantity: 1_000_000_000,
      unitPrice: 99_999_999,
      total: 99_999_999_000_000_000,
    })
    expect(result.success).toBe(false)
    expect(quotePartSchema.safeParse({ ...part, quantity: 100_001 }).success).toBe(false)
    expect(quotePartSchema.safeParse({ ...part, unitPrice: 10_000_001 }).success).toBe(false)
    expect(quotePartSchema.safeParse({ ...part, unitCost: 10_000_001 }).success).toBe(false)
    expect(
      quotePartSchema.safeParse({ ...part, quantity: 100_000, unitPrice: 10, total: 1_000_000 })
        .success
    ).toBe(true)
  })

  it('refuses a line whose quantity times price passes the line limit, whatever total was sent', () => {
    const result = quotePartSchema.safeParse({
      ...part,
      quantity: 100_000,
      unitPrice: 10_001,
      total: 1,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].path).toEqual(['total'])
  })

  it('refuses a priced part at a quantity of zero, and keeps a free one', () => {
    const zero = updateQuoteSchema.safeParse({
      id: 'q1',
      partItems: [{ ...part, quantity: 0, total: 0 }],
    })
    expect(zero.success).toBe(false)
    // Said under the field in the person's language, not in zod's English.
    expect(fieldErrorsFromZod(zero.error!)).toEqual([
      { field: 'partItems.0.quantity', issue: 'positive' },
    ])
    expect(
      quotePartSchema.safeParse({ ...part, quantity: 0, unitPrice: 0, total: 0 }).success
    ).toBe(true)
  })

  it('keeps labour at zero hours and refuses absurd hours or rates', () => {
    expect(quoteLaborSchema.safeParse({ ...labor, hours: 0, total: 0 }).success).toBe(true)
    expect(quoteLaborSchema.safeParse({ ...labor, hours: 100_001 }).success).toBe(false)
    expect(quoteLaborSchema.safeParse({ ...labor, rate: 10_000_001 }).success).toBe(false)
    expect(quoteLaborSchema.safeParse({ ...labor, hours: -1 }).success).toBe(false)
  })

  it('holds a line total to the cent', () => {
    expect(
      quotePartSchema.parse({ ...part, quantity: 3, unitPrice: 0.1, total: 0.30000000000000004 })
        .total
    ).toBe(0.3)
    expect(
      quoteLaborSchema.parse({ ...labor, hours: 2.5, rate: 19.99, total: 49.974999999999994 }).total
    ).toBe(49.98)
  })
})

describe('the quote editor before it saves', () => {
  const parts = (over: Partial<QuotePartInput>) => [{ ...part, unitCost: 0, ...over }]

  it('names the first problem in the order the work order checks', () => {
    expect(findQuoteLineProblem(parts({ quantity: -1 }), [])).toBe('negative')
    expect(findQuoteLineProblem(parts({ quantity: 1_000_000_000 }), [])).toBe('tooLarge')
    expect(findQuoteLineProblem([], [{ ...labor, rate: 99_999_999, hours: 1000 }])).toBe('tooLarge')
    expect(findQuoteLineProblem(parts({ quantity: 0 }), [])).toBe('zeroQuantity')
    expect(findQuoteLineProblem(parts({ quantity: 0, unitPrice: 0 }), [])).toBeNull()
    expect(findQuoteLineProblem([], [{ ...labor, hours: 0 }])).toBeNull()
  })

  it('leaves out the rows a save leaves out', () => {
    // A row with no name is not sent, so it does not stop the save.
    expect(findQuoteLineProblem(parts({ name: '', quantity: 1_000_000_000 }), [])).toBeNull()
  })
})

const t = (key: string) => key

const quotePart = (over: Partial<QuotePartInput>): QuotePartInput => ({
  name: 'Brake pads',
  partNumber: '',
  quantity: 1,
  unitCost: 0,
  markupPercent: 0,
  unitPrice: 100,
  total: 100,
  excluded: false,
  ...over,
})

const quoteLabor = (over: Partial<QuoteLaborInput>): QuoteLaborInput => ({
  description: 'Fit pads',
  hours: 1,
  rate: 100,
  total: 100,
  pricingType: 'hourly',
  excluded: false,
  ...over,
})

function renderParts(items: QuotePartInput[]) {
  return render(
    <QuotePartsEditor
      partItems={items}
      currencyCode="GBP"
      partsSubtotal={0}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onMove={vi.fn()}
      onAdd={vi.fn()}
      t={t}
    />
  )
}

describe('a quote line as it is typed', () => {
  it('marks an absurd quantity and the line total under their fields', () => {
    renderParts([
      quotePart({ quantity: 1_000_000_000, unitPrice: 99_999_999, total: 99_999_999_000_000_000 }),
    ])
    const quantity = screen.getByDisplayValue('1000000000')
    expect(quantity).toHaveAttribute('aria-invalid', 'true')
    expect(quantity).toHaveAccessibleDescription('Must be 100,000 or less.')
    expect(screen.getByDisplayValue('99999999')).toHaveAccessibleDescription(
      'Must be 10,000,000 or less.'
    )
    expect(screen.getByText('Must be 1,000,000,000 or less.')).toBeInTheDocument()
  })

  it('marks a priced part at zero, and not a free one', () => {
    const { unmount } = renderParts([quotePart({ quantity: 0, total: 0 })])
    expect(screen.getByText('Must be more than 0.')).toBeInTheDocument()
    unmount()
    renderParts([quotePart({ quantity: 0, unitPrice: 0, total: 0 })])
    expect(screen.queryByText('Must be more than 0.')).not.toBeInTheDocument()
  })

  it('marks absurd labour hours and leaves zero hours alone', () => {
    const { unmount } = render(
      <QuoteLaborEditor
        laborItems={[quoteLabor({ hours: 1_000_000 })]}
        currencyCode="GBP"
        cs="£"
        laborSubtotal={0}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onAddService={vi.fn()}
        t={t}
      />
    )
    expect(screen.getByDisplayValue('1000000')).toHaveAccessibleDescription(
      'Must be 100,000 or less.'
    )
    unmount()
    render(
      <QuoteLaborEditor
        laborItems={[quoteLabor({ hours: 0, total: 0 })]}
        currencyCode="GBP"
        cs="£"
        laborSubtotal={0}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onMove={vi.fn()}
        onAdd={vi.fn()}
        onAddService={vi.fn()}
        t={t}
      />
    )
    expect(screen.queryByText(/or less|more than 0/)).not.toBeInTheDocument()
  })
})

describe('a quote saved before the limits', () => {
  const tx = {
    servicePart: { createMany: vi.fn() },
    serviceLabor: { createMany: vi.fn() },
  }
  beforeEach(() => vi.clearAllMocks())

  it('still converts, its lines copied onto the job as they are', async () => {
    const stored = {
      id: 'qp1',
      quoteId: 'q1',
      partNumber: null,
      name: 'Brake pads',
      quantity: 1_000_000_000,
      unit: null,
      category: null,
      unitCost: 0,
      markupPercent: 0,
      unitPrice: 99_999_999,
      total: 99_999_999_000_000_000,
      excluded: false,
      inventoryPartId: null,
      taxable: true,
      sortOrder: 0,
    }
    await copyQuotePartsToJob(tx as never, {
      organizationId: 'org-1',
      userId: 'user-1',
      quote: { id: 'q1', quoteNumber: 'QT-1' },
      partItems: [stored] as never,
      target: { id: 'job-1', title: 'Brakes', invoiceNumber: 'INV-1' },
    })
    expect(tx.servicePart.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ quantity: 1_000_000_000, unitPrice: 99_999_999 })],
    })

    await copyQuoteLaborToJob(tx as never, 'job-1', [
      { description: 'Fit', hours: 1_000_000, rate: 100, total: 100_000_000 } as never,
    ])
    expect(tx.serviceLabor.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ hours: 1_000_000 })],
    })
  })
})
