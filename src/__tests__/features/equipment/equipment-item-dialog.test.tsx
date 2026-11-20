/**
 * The equipment item dialog: the Manufactured field takes a year or a full
 * date written the workshop's way, and says exactly that when it refuses
 * what was typed.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  addEquipmentItem: vi.fn(async () => ({ success: true, data: {} })),
  updateEquipmentItem: vi.fn(async () => ({ success: true, data: {} })),
  discardEquipmentReport: vi.fn(async () => ({ success: true, data: { discarded: true } })),
}))
vi.mock('@/features/equipment/Actions/equipmentItemActions', () => actions)
vi.mock('@/features/settings/Actions/timezoneActions', () => ({
  adoptDetectedTimezone: vi.fn(async () => undefined),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { DateSettingsProvider } from '@/components/date-settings-context'
import { EquipmentItemDialog } from '@/features/equipment/Components/EquipmentItemDialog'

const TYPES = [{ id: 'et-crane', name: 'Crane', isActive: true }]

function renderDialog(onClose = vi.fn()) {
  render(
    <DateSettingsProvider dateFormat="dd/MM/yyyy" timezone="Europe/Oslo">
      <EquipmentItemDialog vehicleId="veh-1" types={TYPES} item={null} onClose={onClose} />
    </DateSettingsProvider>
  )
  return onClose
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the Manufactured field', () => {
  it.each([
    '14.5',
    '03/2019',
    '1850',
  ])('refuses %s by naming a year and a full date only', (typed) => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Manufactured'), { target: { value: typed } })
    const message = screen.getByText(
      'Type a year, such as 2019, or a full date, such as 14/05/2019.'
    )
    expect(message).toHaveClass('text-destructive')
    expect(screen.queryByText(/month and year/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('takes a year, or a full date as the workshop writes it', async () => {
    renderDialog()
    fireEvent.change(screen.getByLabelText('Manufactured'), { target: { value: '14/05/2019' } })
    expect(screen.getByLabelText('Manufactured')).not.toHaveAttribute('aria-invalid')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(actions.addEquipmentItem).toHaveBeenCalledWith(
      expect.objectContaining({ manufacture: '2019-05-14' })
    )
  })
})

describe('the dialog while a save is under way', () => {
  const fields = () => [
    screen.getByLabelText('Type'),
    screen.getByLabelText('Make'),
    screen.getByLabelText('Model'),
    screen.getByLabelText('Serial number'),
    screen.getByLabelText('Manufactured'),
    screen.getByLabelText('Installed'),
    screen.getByLabelText('Notes'),
  ]

  it('takes no typing until the save is over, and takes it again once it has failed', async () => {
    let finish: (value: { success: boolean; error?: string }) => void = () => undefined
    actions.addEquipmentItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve as typeof finish
        })
    )
    const onClose = renderDialog()
    fireEvent.change(screen.getByLabelText('Make'), { target: { value: 'HIAB' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    for (const field of fields()) expect(field).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Attach report' })).toBeDisabled()

    await act(async () => {
      finish({ success: false, error: 'offline' })
    })
    expect(onClose).not.toHaveBeenCalled()
    for (const field of fields()) expect(field).toBeEnabled()
    expect(screen.getByLabelText('Make')).toHaveValue('HIAB')
  })
})
