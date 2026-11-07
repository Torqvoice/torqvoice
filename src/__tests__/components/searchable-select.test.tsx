/**
 * The app's dropdown for form fields. A long list gets a search box, so the
 * one field out of thirty is a few letters away instead of a long scroll; a
 * short list stays a plain list.
 */

import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { type SearchableOption, SearchableSelect } from '@/components/ui/searchable-select'

// Radix measures the popover's anchor; jsdom has no ResizeObserver, and
// nothing here needs measuring.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

const fields: SearchableOption[] = [
  { value: '__ignore__', label: 'Ignore this column' },
  { value: 'service.date', label: 'Service date', group: 'Service' },
  { value: 'service.title', label: 'Service title', group: 'Service' },
  {
    value: 'service.description',
    label: 'Description',
    group: 'Service',
    hint: 'In use by Job Desc',
  },
  { value: 'service.total', label: 'Total', group: 'Service' },
  { value: 'vehicle.licensePlate', label: 'Licence plate', group: 'Vehicle', keywords: 'rego' },
  { value: 'vehicle.vin', label: 'VIN', group: 'Vehicle' },
  { value: 'customer.name', label: 'Customer name', group: 'Customer' },
  { value: 'customer.phone', label: 'Phone', group: 'Customer' },
]

function open() {
  fireEvent.click(screen.getByRole('combobox'))
}

describe('SearchableSelect', () => {
  it('shows the chosen option on the button, or the placeholder', () => {
    const { rerender } = render(
      <SearchableSelect value={null} onValueChange={vi.fn()} options={fields} />
    )
    expect(screen.getByRole('combobox')).toHaveTextContent('Choose...')
    rerender(<SearchableSelect value="vehicle.vin" onValueChange={vi.fn()} options={fields} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('VIN')
  })

  it('finds an option by typing part of its name or a keyword, and picks it', () => {
    const onValueChange = vi.fn()
    render(<SearchableSelect value={null} onValueChange={onValueChange} options={fields} />)
    open()

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'rego' } })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Licence plate'])

    fireEvent.click(screen.getByRole('option', { name: 'Licence plate' }))
    expect(onValueChange).toHaveBeenCalledWith('vehicle.licensePlate')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('lists options under their headings with their hints', () => {
    render(<SearchableSelect value={null} onValueChange={vi.fn()} options={fields} />)
    open()
    expect(screen.getByText('Vehicle')).toBeInTheDocument()
    expect(screen.getByText('Customer')).toBeInTheDocument()
    expect(screen.getByText('In use by Job Desc')).toBeInTheDocument()
  })

  it('says so when nothing matches', () => {
    render(<SearchableSelect value={null} onValueChange={vi.fn()} options={fields} />)
    open()
    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'zzz' } })
    expect(screen.getByText('Nothing matches')).toBeInTheDocument()
  })

  it('leaves the search box out of a short list', () => {
    render(<SearchableSelect value={null} onValueChange={vi.fn()} options={fields.slice(0, 3)} />)
    open()
    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })
})
