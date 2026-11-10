/**
 * Removing a mark from the condition map takes it off the drawing at once.
 * When the removal does not go through, the mark comes back and the card says
 * so. A request that never reached the server used to throw inside the card's
 * transition, which replaced the whole page with the error page.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const removeConditionMark = vi.fn()
const removeConditionMarkPhoto = vi.fn()
const toastError = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}))
vi.mock('@/features/condition-map/Actions/conditionMarkActions', () => ({
  addConditionMark: vi.fn(),
  addConditionMarkPhotos: vi.fn(),
  carryConditionMarks: vi.fn(),
  discardConditionMarkUploads: vi.fn(),
  removeConditionMark: async (id: string) => removeConditionMark(id),
  removeConditionMarkPhoto: async (input: unknown) => removeConditionMarkPhoto(input),
  resolveConditionMark: vi.fn(),
  setVehicleBodyType: vi.fn(),
  updateConditionMark: vi.fn(),
}))
// Asks the browser what kind of device this is; a desk, here.
vi.mock('@/hooks/use-native-camera', () => ({ useNativeCamera: () => false }))

import { ConditionMapCard } from '@/features/condition-map/Components/ConditionMapCard'
import { builtinMarkTypes } from '@/features/condition-map/Lib/markTypes'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'

const TYPES = builtinMarkTypes({ dent: 'Dent', scratch: 'Scratch' })

const MARKS: ConditionMarkData[] = [
  {
    id: 'm1',
    vehicleId: 'v1',
    inspectionId: null,
    inspectionItemId: null,
    serviceRecordId: 'job1',
    bodyType: 'sedan',
    view: 'top',
    panel: 'hood',
    x: 0.5,
    y: 0.2,
    kind: 'dent',
    severity: 'minor',
    note: null,
    imageUrls: ['/uploads/dent.jpg'],
    recordedAt: '2026-11-09T09:00:00.000Z',
    resolvedAt: null,
  },
]

const renderCard = () =>
  render(
    <ConditionMapCard
      vehicle={{ id: 'v1', bodyType: 'sedan' }}
      scope={{ serviceRecordId: 'job1' }}
      types={TYPES}
      initialMarks={MARKS}
    />
  )

const legend = () => within(screen.getByRole('region', { name: 'Marks' }))
const openMark = () => fireEvent.click(legend().getByRole('button', { name: /^Mark 1: Dent/ }))

describe('removing from the condition map', () => {
  beforeEach(() => {
    removeConditionMark.mockReset()
    removeConditionMarkPhoto.mockReset()
    toastError.mockClear()
  })

  it('takes the mark off once the server has removed it', async () => {
    removeConditionMark.mockResolvedValue({ success: true })
    renderCard()

    openMark()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove mark' }))
    })

    expect(removeConditionMark).toHaveBeenCalledWith('m1')
    expect(legend().queryByRole('button', { name: /^Mark 1: Dent/ })).not.toBeInTheDocument()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('brings the mark back and says so when the request never reaches the server', async () => {
    removeConditionMark.mockRejectedValue(new TypeError('Failed to fetch'))
    renderCard()

    openMark()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove mark' }))
    })

    expect(legend().getByRole('button', { name: /^Mark 1: Dent/ })).toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith('Could not save the mark')
  })

  it('brings a photo back and says so when its removal never reaches the server', async () => {
    removeConditionMarkPhoto.mockRejectedValue(new TypeError('Failed to fetch'))
    renderCard()

    openMark()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove photo 1' }))
    })

    expect(removeConditionMarkPhoto).toHaveBeenCalledWith({ id: 'm1', url: '/uploads/dent.jpg' })
    expect(screen.getByRole('button', { name: 'Remove photo 1' })).toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith('Could not save the mark')
  })
})
