/**
 * Deleting a file tile on a work order or an inspection. When the delete
 * never reaches the server the tile says it failed and can be pressed again.
 * It used to stay busy, with its Delete button dead, until the page was
 * reloaded.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const toastError = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: (...args: unknown[]) => toastError(...args),
  },
}))
vi.mock('@/features/vehicles/Actions/addServiceAttachment', () => ({
  addServiceAttachment: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/updateServiceAttachment', () => ({
  updateServiceAttachment: vi.fn(),
}))
vi.mock('@/features/vehicles/Actions/serviceActions', () => ({
  deleteServiceAttachment: vi.fn(),
}))
vi.mock('@/features/settings/Actions/timezoneActions', () => ({ adoptDetectedTimezone: vi.fn() }))
vi.mock('@/features/whatsapp/Components/SendPhotoToWhatsapp', () => ({
  SendPhotoToWhatsapp: () => null,
}))

import {
  MediaGrid,
  type MediaStore,
} from '@/features/vehicles/Components/service-page/modern/MediaGrid'

const FILE = {
  id: 'f1',
  fileName: 'alignment-report.pdf',
  fileUrl: '/uploads/alignment-report.pdf',
  fileType: 'application/pdf',
  fileSize: 120_000,
  category: 'document',
  description: null,
  includeInInvoice: true,
  createdAt: new Date('2026-11-09T09:00:00.000Z'),
}

const remove = vi.fn()
const store: MediaStore = {
  add: vi.fn(),
  update: vi.fn(),
  remove: async (id) => remove(id),
}

const renderGrid = () =>
  render(<MediaGrid kind="document" serviceRecordId="job1" store={store} files={[FILE]} />)

const pressDelete = () =>
  act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  })

describe('deleting a file tile', () => {
  beforeEach(() => {
    remove.mockReset()
    toastError.mockClear()
  })

  it('removes the tile once the server has deleted the file', async () => {
    remove.mockResolvedValue({ success: true })
    renderGrid()

    await pressDelete()

    expect(remove).toHaveBeenCalledWith('f1')
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('says the delete failed and stays usable when the request never reaches the server', async () => {
    remove.mockRejectedValue(new TypeError('Failed to fetch'))
    renderGrid()

    await pressDelete()

    expect(toastError).toHaveBeenCalledWith('Failed to delete')
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })
})
