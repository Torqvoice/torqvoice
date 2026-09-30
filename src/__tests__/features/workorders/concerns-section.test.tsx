import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConcernsSection } from '@/features/vehicles/Components/service-edit/ConcernsSection'
import type { ServiceConcernInput } from '@/features/vehicles/Schema/serviceSchema'

/**
 * The customer's concerns are a field from the moment a job opens. They used
 * to be one grey link until somebody clicked it, and a workshop asked for them
 * to be made visible.
 */

function Harness({
  initial = [],
  onChange = vi.fn(),
  answeredCounts,
  onState,
}: {
  initial?: ServiceConcernInput[]
  onChange?: () => void
  answeredCounts?: Record<string, number>
  onState?: (concerns: ServiceConcernInput[]) => void
}) {
  const [concerns, setConcerns] = useState(initial)
  onState?.(concerns)
  return (
    <ConcernsSection
      concerns={concerns}
      setConcerns={setConcerns}
      onChange={onChange}
      answeredCounts={answeredCounts}
    />
  )
}

describe('the customer concerns field', () => {
  it('is a named field with somewhere to type before anything is written', () => {
    render(<Harness />)
    expect(screen.getByRole('heading', { name: 'Customer concerns' })).toBeInTheDocument()
    expect(screen.getAllByRole('textbox', { name: 'Customer concerns' })).toHaveLength(1)
    expect(screen.getByText(/in their own words/)).toBeInTheDocument()
    // Nothing to remove, and nothing said about findings, until there are words.
    expect(screen.queryByRole('button', { name: 'Remove this concern' })).toBeNull()
    expect(screen.queryByText('Nothing found against this yet')).toBeNull()
  })

  it('holds no concern until somebody types, so a blank row is never saved', () => {
    let state: ServiceConcernInput[] = []
    const onChange = vi.fn()
    render(
      <Harness
        onChange={onChange}
        onState={(c) => {
          state = c
        }}
      />
    )
    expect(state).toEqual([])
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Pulls right when braking' } })
    expect(state).toEqual([{ description: 'Pulls right when braking', sortOrder: 0 }])
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('keeps the same field under the cursor as the first concern becomes real', () => {
    render(<Harness />)
    const field = screen.getByRole('textbox')
    fireEvent.change(field, { target: { value: 'A' } })
    // Replaced, the field would drop focus after the first letter typed.
    expect(screen.getByRole('textbox')).toBe(field)
  })

  it('takes more than one line, because customers speak in sentences', () => {
    render(<Harness />)
    expect(screen.getByRole('textbox').tagName).toBe('TEXTAREA')
  })

  it('adds a second concern in words, and not while a row is still blank', () => {
    render(<Harness />)
    const add = screen.getByRole('button', { name: 'Add another' })
    expect(add).toBeDisabled()

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Aircon smells' } })
    expect(add).toBeEnabled()
    fireEvent.click(add)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    expect(add).toBeDisabled()
  })

  it('says which concern nobody has looked at yet', () => {
    render(
      <Harness
        initial={[
          { id: 'c1', description: 'Pulls right when braking', sortOrder: 0 },
          { id: 'c2', description: 'Aircon smells', sortOrder: 1 },
        ]}
        answeredCounts={{ c1: 2 }}
      />
    )
    expect(screen.getByText('2 observations against this')).toBeInTheDocument()
    expect(screen.getByText('Nothing found against this yet')).toBeInTheDocument()
  })

  it('goes back to the open field when the last concern is removed', () => {
    let state: ServiceConcernInput[] = []
    render(
      <Harness
        initial={[{ id: 'c1', description: 'Aircon smells', sortOrder: 0 }]}
        onState={(c) => {
          state = c
        }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove this concern' }))
    expect(state).toEqual([])
    expect(screen.getAllByRole('textbox')).toHaveLength(1)
    expect(screen.getByRole('textbox')).toHaveValue('')
  })
})
