/**
 * The vehicle photo from a phone: the photo is read before the code is shown,
 * so the first one the phone sends is noticed even if it lands before the
 * dialog's first check, and nothing is reported when nothing changed.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}))
vi.mock('@/features/vehicles/Actions/photoHandoffActions', () => ({
  countPhotosSince: vi.fn(),
  createPhotoHandoffLink: vi.fn(),
  createVehiclePhotoHandoffLink: vi.fn(),
  getVehiclePhotoUrl: vi.fn(),
}))
vi.mock('@/features/inspections/Actions/attachmentActions', () => ({
  countInspectionMedia: vi.fn(),
  createInspectionHandoffLink: vi.fn(),
}))

import {
  createVehiclePhotoHandoffLink,
  getVehiclePhotoUrl,
} from '@/features/vehicles/Actions/photoHandoffActions'
import { PhotoHandoffButton } from '@/features/vehicles/Components/service-page/PhotoHandoffButton'

const OLD = '/api/protected/files/org-a/vehicles/old.jpg'
const NEW = '/api/protected/files/org-a/vehicles/new.jpg'

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(createVehiclePhotoHandoffLink).mockResolvedValue({
    success: true,
    data: { token: 'vh1.token', expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
  } as never)
})

function open(onVehiclePhoto = vi.fn()) {
  render(<PhotoHandoffButton vehicleId="veh-1" onVehiclePhoto={onVehiclePhoto} />)
  fireEvent.click(screen.getByRole('button', { name: 'Add from phone' }))
  return onVehiclePhoto
}

describe('vehicle photo from a phone', () => {
  it('notices a photo that landed before the first check', async () => {
    // Read once before the code is shown, then the phone has already sent one.
    vi.mocked(getVehiclePhotoUrl)
      .mockResolvedValueOnce({ success: true, data: OLD } as never)
      .mockResolvedValue({ success: true, data: NEW } as never)

    const onVehiclePhoto = open()

    await waitFor(() => expect(onVehiclePhoto).toHaveBeenCalledWith(NEW))
  })

  it('reports nothing while the photo is still the one it had', async () => {
    vi.mocked(getVehiclePhotoUrl).mockResolvedValue({ success: true, data: OLD } as never)

    const onVehiclePhoto = open()

    await waitFor(() => expect(getVehiclePhotoUrl).toHaveBeenCalledTimes(2))
    expect(onVehiclePhoto).not.toHaveBeenCalled()
  })

  it('shows no code when the photo it would compare with cannot be read', async () => {
    vi.mocked(getVehiclePhotoUrl).mockResolvedValue({ success: false, error: 'nope' } as never)

    open()

    expect(await screen.findByText('Could not make a code. Try again.')).toBeInTheDocument()
    expect(screen.queryByText(/vh1\.token/)).not.toBeInTheDocument()
  })
})
