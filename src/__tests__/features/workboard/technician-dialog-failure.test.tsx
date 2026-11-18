/**
 * The work board's technician dialog when the server says no or cannot be
 * reached. A refused delete or save used to do nothing at all: no message,
 * the dialog simply stayed. A dropped connection threw past the handler and
 * left the button spinning until the page was reloaded.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const deleteTechnician = vi.fn()
const updateTechnician = vi.fn()

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({
  createTechnician: vi.fn(),
  updateTechnician: (input: unknown) => updateTechnician(input),
  deleteTechnician: (id: string) => deleteTechnician(id),
  getOrgMembers: async () => ({ success: true, data: [] }),
}))

import { TechnicianDialog } from '@/features/workboard/Components/TechnicianDialog'
import { useWorkBoardStore, type Technician } from '@/features/workboard/store/workboardStore'

const TECH: Technician = {
  id: 't1',
  name: 'Ola Nordmann',
  color: '#3b82f6',
  isActive: true,
  sortOrder: 0,
  dailyCapacity: 8,
  skills: null,
  userId: null,
  organizationId: 'org1',
}

const onOpenChange = vi.fn()

function renderDialog() {
  render(
    <ConfirmProvider>
      <TechnicianDialog open onOpenChange={onOpenChange} technician={TECH} />
    </ConfirmProvider>
  )
}

async function deleteAndConfirm() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  const question = await screen.findByRole('alertdialog')
  await act(async () => {
    fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
  })
}

describe('technician dialog failures', () => {
  beforeEach(() => {
    deleteTechnician.mockReset()
    updateTechnician.mockReset()
    onOpenChange.mockClear()
    vi.mocked(toast.error).mockClear()
    useWorkBoardStore.getState().setTechnicians([TECH])
  })

  it('says the delete was refused and keeps the technician on the board', async () => {
    deleteTechnician.mockResolvedValue({ success: false, error: 'Insufficient permissions' })
    renderDialog()

    await deleteAndConfirm()

    expect(deleteTechnician).toHaveBeenCalledWith('t1')
    expect(toast.error).toHaveBeenCalledWith('Insufficient permissions')
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(useWorkBoardStore.getState().technicians.map((t) => t.id)).toEqual(['t1'])
  })

  it('says the delete failed when the connection drops, and leaves Delete usable', async () => {
    deleteTechnician.mockImplementation(offline)
    renderDialog()

    await deleteAndConfirm()

    expect(toast.error).toHaveBeenCalledWith("Couldn't delete the technician. Try again.")
    expect(useWorkBoardStore.getState().technicians.map((t) => t.id)).toEqual(['t1'])
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('says saving failed when the connection drops, and keeps what was typed', async () => {
    updateTechnician.mockImplementation(offline)
    renderDialog()

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Ola N.' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    expect(updateTechnician).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith("Couldn't save the technician. Try again.")
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByLabelText('Name')).toHaveValue('Ola N.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
    expect(useWorkBoardStore.getState().technicians[0].name).toBe('Ola Nordmann')
  })
})
