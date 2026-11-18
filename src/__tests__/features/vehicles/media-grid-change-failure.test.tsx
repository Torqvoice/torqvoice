/**
 * Showing a file to the customer, hiding it, or giving it a caption shows on
 * the tile at once. When the change never reaches the server the tile goes
 * back to what it was and says the update failed. A dropped connection used
 * to leave the tile showing a change the server never made, and a caption
 * that was refused went unmentioned.
 *
 * A tile takes one change at a time, so a failure never puts back a value a
 * newer change on the same tile has already replaced.
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

const update = vi.fn()
const store: MediaStore = {
  add: vi.fn(),
  update: (input) => update(input),
  remove: vi.fn(),
}

const renderGrid = () =>
  render(<MediaGrid kind="document" serviceRecordId="job1" store={store} files={[FILE]} />)

const gate = () => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

describe('changing a file tile when the change does not go through', () => {
  beforeEach(() => {
    update.mockReset()
    toastError.mockClear()
  })

  it('shows the file to the customer again when hiding it never reaches the server', async () => {
    const answer = gate()
    update.mockImplementation(async () => {
      await answer.opened
      throw new TypeError('Failed to fetch')
    })
    renderGrid()
    expect(screen.getByText('Customer can see')).toBeInTheDocument()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide from the customer' }))
    })
    expect(screen.queryByText('Customer can see')).not.toBeInTheDocument()

    await act(async () => answer.open())

    expect(update).toHaveBeenCalledWith({ id: 'f1', includeInInvoice: false })
    expect(screen.getByText('Customer can see')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide from the customer' })).toBeEnabled()
    expect(toastError).toHaveBeenCalledWith('Failed to update')
  })

  it('takes one change at a time on a tile', async () => {
    const answer = gate()
    update.mockImplementation(async () => {
      await answer.opened
      return { success: true }
    })
    renderGrid()

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide from the customer' }))
    })
    const show = screen.getByRole('button', { name: 'Show to the customer' })
    expect(show).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Description...' })).toHaveAttribute('readonly')

    await act(async () => answer.open())

    expect(show).toBeEnabled()
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('puts the caption back when saving it never reaches the server', async () => {
    update.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    renderGrid()
    const caption = screen.getByRole('textbox', { name: 'Description...' })

    fireEvent.change(caption, { target: { value: 'Front left toe out of spec' } })
    await act(async () => {
      fireEvent.blur(caption)
    })

    expect(update).toHaveBeenCalledWith({ id: 'f1', description: 'Front left toe out of spec' })
    expect(caption).toHaveValue('')
    expect(caption).not.toHaveAttribute('readonly')
    expect(toastError).toHaveBeenCalledWith('Failed to update')
  })

  it('says so when the server refuses a caption', async () => {
    update.mockResolvedValue({ success: false, error: 'Not allowed' })
    renderGrid()
    const caption = screen.getByRole('textbox', { name: 'Description...' })

    fireEvent.change(caption, { target: { value: 'Front left toe out of spec' } })
    await act(async () => {
      fireEvent.blur(caption)
    })

    expect(caption).toHaveValue('')
    expect(toastError).toHaveBeenCalledWith('Not allowed')
  })
})
