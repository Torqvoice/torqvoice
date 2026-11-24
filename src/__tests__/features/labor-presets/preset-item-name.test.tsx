/**
 * A labour preset row with hours but no name is marked under its own name
 * field ("Give this item a name."), not refused with "At least one item is
 * required" while the item sits right there. The blank spare row is dropped
 * without a word, as before.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createLaborPreset = vi.hoisted(() => vi.fn())
const modalOpen = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/glass-modal', () => ({ useGlassModal: () => ({ open: modalOpen }) }))
vi.mock('@/features/labor-presets/Actions/laborPresetActions', () => ({
  createLaborPreset,
  updateLaborPreset: vi.fn(),
}))

import { LaborPresetForm } from '@/features/labor-presets/Components/LaborPresetForm'
import { namelessItemRows } from '@/features/labor-presets/Lib/namelessItems'

beforeEach(() => {
  vi.clearAllMocks()
  createLaborPreset.mockResolvedValue({ success: true, data: { id: 'p1' } })
})

function renderForm() {
  render(
    <LaborPresetForm
      open
      onOpenChange={vi.fn()}
      defaultLaborRate={900}
      inventoryParts={[]}
      currencyCode="NOK"
    />
  )
}

const save = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Create Package' }))
  })
}

describe('a preset item without a name', () => {
  it('is marked under its name, and nothing is saved', async () => {
    renderForm()
    const hours = screen.getAllByRole('spinbutton')[0]
    fireEvent.change(hours, { target: { value: '1.5' } })
    await save()

    const name = screen.getByRole('textbox', { name: 'Name' })
    const message = screen.getByText('Give this item a name.')
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(name.getAttribute('aria-describedby')).toBe(message.id)
    expect(name).toHaveFocus()
    expect(screen.queryByText(/At least one item is required/)).not.toBeInTheDocument()
    expect(modalOpen).not.toHaveBeenCalled()
    expect(createLaborPreset).not.toHaveBeenCalled()

    // Named, the mark goes and the item saves.
    fireEvent.change(name, { target: { value: 'Oil change' } })
    expect(screen.queryByText('Give this item a name.')).not.toBeInTheDocument()
    await save()
    expect(createLaborPreset).toHaveBeenCalledTimes(1)
  })
})

describe('which rows need a name', () => {
  it('marks rows with hours or a description and no name', () => {
    expect(
      namelessItemRows([
        { name: 'Brakes', hours: 1 },
        { name: '', hours: 2 },
        { name: '', description: 'Front axle', hours: 0 },
        { name: '', hours: 0 },
      ])
    ).toEqual([1, 2])
  })

  it('drops an untouched spare row once another has a name', () => {
    expect(
      namelessItemRows([
        { name: 'Brakes', hours: 1 },
        { name: '', hours: 0 },
      ])
    ).toEqual([])
  })

  it('marks the first row when none has a name at all', () => {
    expect(namelessItemRows([{ name: '', hours: 0 }])).toEqual([0])
  })
})
