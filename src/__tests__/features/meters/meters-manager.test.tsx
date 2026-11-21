/**
 * The workshop's meters in Settings, Custom Fields: one dialog adds a meter
 * and edits one, with its name, its unit and "Required on work orders". A
 * suggestion opens that dialog filled in, so the switch can be set before
 * the meter exists, and a required meter says so in the list.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const saveMeterType = vi.hoisted(() => vi.fn())
const refresh = vi.hoisted(() => vi.fn())
vi.mock('@/features/meters/Actions/meterTypeActions', () => ({
  saveMeterType,
  updateMeterType: vi.fn(),
  deleteMeterType: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('@/components/confirm-dialog', () => ({ useConfirm: () => vi.fn() }))

import { MetersManager, type MeterTypeRow } from '@/features/meters/Components/MetersManager'

// The switch measures itself; jsdom has no ResizeObserver, and nothing here needs measuring.
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

const PTO: MeterTypeRow = {
  id: 't-pto',
  name: 'PTO hours',
  unit: 'hrs',
  isActive: true,
  required: false,
  _count: { vehicleMeters: 2 },
}
const SUGGESTIONS = [{ name: 'Engine hours', unit: 'hrs' }]

beforeEach(() => {
  saveMeterType.mockReset().mockResolvedValue({ success: true, data: { id: 'x' } })
  refresh.mockReset()
})

const dialog = () => screen.getByRole('dialog')
const requiredSwitch = () =>
  within(dialog()).getByRole('switch', { name: 'Required on work orders' })

describe('adding a meter', () => {
  it('opens one dialog from the button, with name, unit and the required switch off', async () => {
    render(<MetersManager meters={[]} suggestions={SUGGESTIONS} />)
    // No inline row any more: the fields live in the dialog.
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add meter' }))
    expect(within(dialog()).getByRole('heading', { name: 'Add a meter' })).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Name')).toHaveValue('')
    expect(requiredSwitch()).not.toBeChecked()
    expect(
      within(dialog()).getByText(
        'Asked for when the job is completed, and before its invoice is sent.'
      )
    ).toBeInTheDocument()

    fireEvent.change(within(dialog()).getByLabelText('Name'), { target: { value: 'Crane hours' } })
    fireEvent.change(within(dialog()).getByLabelText('Unit'), { target: { value: 'h' } })
    fireEvent.click(requiredSwitch())
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Add meter' }))
    })
    expect(saveMeterType).toHaveBeenCalledWith({
      id: undefined,
      name: 'Crane hours',
      unit: 'h',
      options: { required: true },
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(refresh).toHaveBeenCalled()
  })

  it('from a suggestion opens the dialog filled in, instead of adding it at once', async () => {
    render(<MetersManager meters={[]} suggestions={SUGGESTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: /Engine hours/ }))
    expect(saveMeterType).not.toHaveBeenCalled()
    expect(within(dialog()).getByLabelText('Name')).toHaveValue('Engine hours')
    expect(within(dialog()).getByLabelText('Unit')).toHaveValue('hrs')
    fireEvent.click(requiredSwitch())
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Add meter' }))
    })
    expect(saveMeterType).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Engine hours', unit: 'hrs', options: { required: true } })
    )
  })

  it('keeps the dialog open and says why when the save is refused', async () => {
    saveMeterType.mockResolvedValue({ success: false, error: 'duplicateName' })
    render(<MetersManager meters={[]} suggestions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add meter' }))
    fireEvent.change(within(dialog()).getByLabelText('Name'), { target: { value: 'PTO hours' } })
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Add meter' }))
    })
    expect(dialog()).toBeInTheDocument()
  })
})

describe('editing a meter', () => {
  it('opens the same dialog on the meter as it is, and saves it as required', async () => {
    render(<MetersManager meters={[PTO]} suggestions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit PTO hours' }))
    expect(within(dialog()).getByRole('heading', { name: 'Edit meter' })).toBeInTheDocument()
    expect(within(dialog()).getByLabelText('Name')).toHaveValue('PTO hours')
    expect(requiredSwitch()).not.toBeChecked()
    fireEvent.click(requiredSwitch())
    await act(async () => {
      fireEvent.click(within(dialog()).getByRole('button', { name: 'Save' }))
    })
    expect(saveMeterType).toHaveBeenCalledWith({
      id: 't-pto',
      name: 'PTO hours',
      unit: 'hrs',
      options: { required: true },
    })
  })

  it('starts from the meter’s own options', () => {
    render(<MetersManager meters={[{ ...PTO, required: true }]} suggestions={[]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit PTO hours' }))
    expect(requiredSwitch()).toBeChecked()
  })
})

describe('the list', () => {
  it('marks a required meter, and only that one', () => {
    render(
      <MetersManager
        meters={[
          { ...PTO, required: true },
          { ...PTO, id: 't-engine', name: 'Engine hours', required: false },
        ]}
        suggestions={[]}
      />
    )
    expect(within(screen.getByTestId('meter-type-t-pto')).getByText('Required')).toBeVisible()
    expect(within(screen.getByTestId('meter-type-t-engine')).queryByText('Required')).toBeNull()
  })
})
