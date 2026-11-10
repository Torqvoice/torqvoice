/**
 * Removing a photo from a check takes it off the row at once. When the
 * removal does not go through, because the server refused it or the request
 * never arrived, the photo comes back and the row says so. On a dropped
 * connection it used to stay gone until the page was reloaded, where it was
 * back as if nothing had been pressed.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeInspectionItemMedia = vi.fn()
const toastError = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}))
vi.mock('@/features/inspections/Actions/inspectionActions', () => ({
  updateInspectionItem: vi.fn(),
}))
vi.mock('@/features/inspections/Actions/attachmentActions', () => ({
  addInspectionItemMedia: vi.fn(),
  removeInspectionItemMedia: async (input: unknown) => removeInspectionItemMedia(input),
}))
vi.mock('@/features/vehicles/Components/service-page/PhotoHandoffButton', () => ({
  PhotoHandoffButton: () => null,
}))

import { InspectionItemRow } from '@/features/inspections/Components/InspectionItemRow'

const ITEM = {
  id: 'tyres',
  name: 'Tyres',
  section: 'Wheels',
  sortOrder: 0,
  condition: 'fail',
  notes: null,
  imageUrls: ['/uploads/tread.jpg', '/uploads/sidewall.jpg'],
}

const renderRow = () =>
  render(
    <InspectionItemRow
      item={ITEM}
      scale="eu"
      isCompleted={false}
      onOpenImage={() => undefined}
      onChanged={() => undefined}
    />
  )

const photos = () => screen.getAllByRole('img').map((img) => img.getAttribute('src'))

const removeFirst = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1 from Tyres' }))
  })

describe('removing a photo from a check', () => {
  beforeEach(() => {
    removeInspectionItemMedia.mockReset()
    toastError.mockClear()
  })

  it('takes the photo off the row once the server has removed it', async () => {
    removeInspectionItemMedia.mockResolvedValue({ success: true, data: ['/uploads/sidewall.jpg'] })
    renderRow()

    await removeFirst()

    expect(removeInspectionItemMedia).toHaveBeenCalledWith({
      itemId: 'tyres',
      url: '/uploads/tread.jpg',
    })
    expect(photos()).toEqual(['/uploads/sidewall.jpg'])
    expect(toastError).not.toHaveBeenCalled()
  })

  it('brings the photo back and says so when the request never reaches the server', async () => {
    removeInspectionItemMedia.mockRejectedValue(new TypeError('Failed to fetch'))
    renderRow()

    await removeFirst()

    expect(photos()).toHaveLength(2)
    expect(photos()).toContain('/uploads/tread.jpg')
    expect(toastError).toHaveBeenCalledWith('Could not save this check')
  })

  it('brings the photo back with the reason when the server refuses', async () => {
    removeInspectionItemMedia.mockResolvedValue({
      success: false,
      error: 'Reopen the inspection to change its photos',
    })
    renderRow()

    await removeFirst()

    expect(photos()).toContain('/uploads/tread.jpg')
    expect(toastError).toHaveBeenCalledWith('Reopen the inspection to change its photos')
  })
})
