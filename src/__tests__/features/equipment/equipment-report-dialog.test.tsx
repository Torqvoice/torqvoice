/**
 * The equipment dialog's report: the upload writes the file before any item
 * points at it, so a report taken off before saving, or a dialog cancelled
 * with one, lets go of the file. A saved one is the item's and stays.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  addEquipmentItem: vi.fn(async () => ({ success: true, data: {} })),
  updateEquipmentItem: vi.fn(async () => ({ success: true, data: {} })),
  discardEquipmentReport: vi.fn(async () => ({ success: true, data: { discarded: true } })),
}))
vi.mock('@/features/equipment/Actions/equipmentItemActions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

import { EquipmentItemDialog } from '@/features/equipment/Components/EquipmentItemDialog'

const URL_1 = '/api/protected/files/org-1/vehicles/11111111-1111-4111-8111-111111111111.pdf'
const TYPES = [{ id: 'et-crane', name: 'Crane', isActive: true }]

function renderDialog(onClose = vi.fn()) {
  render(<EquipmentItemDialog vehicleId="veh-1" types={TYPES} item={null} onClose={onClose} />)
  return onClose
}

async function upload() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  await act(async () => {
    fireEvent.change(input, {
      target: { files: [new File(['%PDF'], 'LOLER.pdf', { type: 'application/pdf' })] },
    })
  })
  await screen.findByText('LOLER.pdf')
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ url: URL_1, name: 'LOLER.pdf' })))
  )
})

describe('a report uploaded in the equipment dialog', () => {
  it('is let go of when the dialog is cancelled without saving', async () => {
    const onClose = renderDialog()
    await upload()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(actions.discardEquipmentReport).toHaveBeenCalledWith(URL_1)
    expect(onClose).toHaveBeenCalled()
  })

  it('is let go of when it is taken off before saving', async () => {
    renderDialog()
    await upload()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove LOLER.pdf' }))
    })
    expect(actions.discardEquipmentReport).toHaveBeenCalledWith(URL_1)
  })

  it('stays once the item is saved with it', async () => {
    renderDialog()
    await upload()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(actions.addEquipmentItem).toHaveBeenCalledWith(
      expect.objectContaining({ report: { url: URL_1, name: 'LOLER.pdf' } })
    )
    expect(actions.discardEquipmentReport).not.toHaveBeenCalled()
  })

  it('keeps the dialog open, and the report, while the save is under way', async () => {
    let finish: (value: { success: boolean; data: object }) => void = () => undefined
    actions.addEquipmentItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const onClose = renderDialog()
    await upload()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    // Cancel and the X cannot be pressed, and Escape does nothing.
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove LOLER.pdf' })).toBeDisabled()
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('equipment-dialog'), { key: 'Escape' })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    expect(onClose).not.toHaveBeenCalled()
    expect(actions.discardEquipmentReport).not.toHaveBeenCalled()
    expect(screen.getByTestId('equipment-dialog')).toBeInTheDocument()

    await act(async () => {
      finish({ success: true, data: {} })
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(actions.discardEquipmentReport).not.toHaveBeenCalled()
  })

  it('can be cancelled again once a save has failed', async () => {
    actions.addEquipmentItem.mockRejectedValueOnce(new Error('offline'))
    const onClose = renderDialog()
    await upload()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
    await act(async () => {
      fireEvent.keyDown(screen.getByTestId('equipment-dialog'), { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(actions.discardEquipmentReport).toHaveBeenCalledWith(URL_1)
  })
})
