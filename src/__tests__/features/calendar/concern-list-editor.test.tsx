import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConcernListEditor } from '@/features/calendar/Components/ConcernListEditor'

/** The editor as the dialog uses it, with its text kept in state. */
function Harness({ initial = '', disabled = false }: { initial?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <ConcernListEditor value={value} onChange={setValue} disabled={disabled} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  )
}

const value = () => JSON.parse(screen.getByTestId('value').textContent ?? '""')
const addField = () => screen.getByLabelText('Add a concern and press Enter')

describe('the list of concerns', () => {
  it('takes a concern per Enter, in order', () => {
    render(<Harness />)
    fireEvent.change(addField(), { target: { value: 'Front brakes squeal' } })
    fireEvent.keyDown(addField(), { key: 'Enter' })
    fireEvent.change(addField(), { target: { value: 'Oil service' } })
    fireEvent.keyDown(addField(), { key: 'Enter' })

    expect(value()).toBe('Front brakes squeal\nOil service')
    expect(screen.getByLabelText('Concern 1')).toHaveValue('Front brakes squeal')
    expect(addField()).toHaveValue('')
  })

  it('keeps what was typed when the field is left without Enter', () => {
    render(<Harness />)
    fireEvent.change(addField(), { target: { value: 'Check AC' } })
    fireEvent.blur(addField())
    expect(value()).toBe('Check AC')
  })

  it('turns a pasted list into one concern per line', () => {
    render(<Harness initial="Oil service" />)
    fireEvent.paste(addField(), {
      clipboardData: { getData: () => 'Front brakes squeal\n\n  Check AC  \nWipers' },
    })
    expect(value()).toBe('Oil service\nFront brakes squeal\nCheck AC\nWipers')
  })

  it('opens a row below on Enter and drops an empty one on Backspace', () => {
    render(<Harness initial={'Oil service\nCheck AC'} />)
    fireEvent.keyDown(screen.getByLabelText('Concern 1'), { key: 'Enter' })
    expect(value()).toBe('Oil service\n\nCheck AC')
    fireEvent.keyDown(screen.getByLabelText('Concern 2'), { key: 'Backspace' })
    expect(value()).toBe('Oil service\nCheck AC')
  })

  it('removes a concern with its button, and edits one in place', () => {
    render(<Harness initial={'Oil service\nCheck AC'} />)
    fireEvent.change(screen.getByLabelText('Concern 2'), {
      target: { value: 'Check AC, no cold air' },
    })
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove concern' })[0])
    expect(value()).toBe('Check AC, no cold air')
  })

  it('shows recorded concerns without letting them change', () => {
    render(<Harness initial="Oil service" disabled />)
    expect(screen.getByLabelText('Concern 1')).toBeDisabled()
    expect(screen.queryByLabelText('Add a concern and press Enter')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove concern' })).not.toBeInTheDocument()
  })
})
