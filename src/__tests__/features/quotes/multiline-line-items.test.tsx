/**
 * A part or a labour line often needs a second line. The invoice editor has
 * always taken one; the quote editor was single-line inputs, which swallow a
 * newline entirely, so the same job written as a quote lost its formatting.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QuotePartsEditor } from '@/features/quotes/Components/QuotePartsEditor'
import { QuoteLaborEditor } from '@/features/quotes/Components/QuoteLaborEditor'

const t = (key: string) => key

const part = {
  name: 'Brake pads\nfront axle',
  partNumber: '',
  quantity: 1,
  unitPrice: 100,
  total: 100,
  excluded: false,
}

const labor = {
  description: 'Replace pads\nbleed brakes',
  hours: 2,
  rate: 800,
  total: 1600,
  pricingType: 'hourly',
  excluded: false,
}

describe('quote line items take more than one line', () => {
  it('gives the part name a textarea holding the break', () => {
    render(
      <QuotePartsEditor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        partItems={[part as any]}
        currencyCode="NOK"
        partsSubtotal={100}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
        t={t}
      />
    )
    // getByDisplayValue normalizes whitespace, which is the very thing under
    // test, so the field is found by its placeholder and read directly.
    const field = screen.getByPlaceholderText('parts.namePlaceholder') as HTMLTextAreaElement
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.value).toBe('Brake pads\nfront axle')
  })

  it('gives the labour description a textarea holding the break', () => {
    render(
      <QuoteLaborEditor
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        laborItems={[labor as any]}
        currencyCode="NOK"
        cs="kr"
        laborSubtotal={1600}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
        onAdd={vi.fn()}
        t={t}
      />
    )
    const field = screen.getByPlaceholderText('labor.descriptionPlaceholder') as HTMLTextAreaElement
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.value).toBe('Replace pads\nbleed brakes')
  })
})
