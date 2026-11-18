/**
 * Archiving a vehicle on a dropped connection. The action throws instead of
 * answering when it cannot reach the server, and the dialog only read the
 * answer: its error was never shown and both its buttons stayed disabled
 * until the page was reloaded.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What a dropped connection does to a server action: it throws. */
const offline = async () => {
  throw new TypeError('Failed to fetch')
}

const archiveVehicle = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/vehicles/Actions/archiveVehicle', () => ({
  archiveVehicle: (id: string, reason?: string) => archiveVehicle(id, reason),
}))

import { ArchiveVehicleDialog } from '@/features/vehicles/Components/ArchiveVehicleDialog'

function renderDialog() {
  const onOpenChange = vi.fn()
  render(
    <ArchiveVehicleDialog
      open
      onOpenChange={onOpenChange}
      vehicleId="v1"
      vehicleName="Volvo XC60"
    />
  )
  return onOpenChange
}

const archiveButton = () => screen.getByRole('button', { name: 'Archive Vehicle' })

async function archiveWithReason(reason: string) {
  fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: reason } })
  await act(async () => {
    fireEvent.click(archiveButton())
  })
}

describe('archiving a vehicle on a dropped connection', () => {
  beforeEach(() => {
    archiveVehicle.mockReset()
    router.refresh.mockClear()
    vi.mocked(toast.error).mockClear()
    vi.mocked(toast.success).mockClear()
  })

  it('says the archive failed and leaves the dialog ready to try again', async () => {
    archiveVehicle.mockImplementation(offline)
    const onOpenChange = renderDialog()

    await archiveWithReason('Sold')

    expect(archiveVehicle).toHaveBeenCalledWith('v1', 'Sold')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to archive vehicle'))
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(router.refresh).not.toHaveBeenCalled()
    // Still open, with the reason as typed and both buttons usable.
    expect(screen.getByLabelText('Reason (optional)')).toHaveValue('Sold')
    expect(archiveButton()).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()

    // The connection is back.
    archiveVehicle.mockResolvedValue({ success: true })
    await act(async () => {
      fireEvent.click(archiveButton())
    })

    expect(archiveVehicle).toHaveBeenCalledTimes(2)
    expect(toast.success).toHaveBeenCalledWith('Volvo XC60 archived')
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(router.refresh).toHaveBeenCalled()
  })

  it('shows what the server said when it refuses', async () => {
    archiveVehicle.mockResolvedValue({ success: false, error: 'Vehicle has an open work order' })
    renderDialog()

    await archiveWithReason('')

    expect(toast.error).toHaveBeenCalledWith('Vehicle has an open work order')
    expect(archiveButton()).toBeEnabled()
  })
})
