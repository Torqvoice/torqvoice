/**
 * A change to a mark on the condition map shows at once. When it does not go
 * through, the mark goes back to what it was and the card says so. A request
 * that never reached the server used to throw inside the card's transition,
 * which replaced the whole page with the error page.
 *
 * Changes that overlap are settled together: two that both fail leave the
 * mark as it was before the first, whichever answers first, and one that
 * fails beside another that went through has the card read back from the
 * server rather than undo the other.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateConditionMark = vi.fn()
const carryConditionMarks = vi.fn()
const refresh = vi.fn()
const toastError = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: (...args: unknown[]) => toastError(...args) },
}))
vi.mock('@/features/condition-map/Actions/conditionMarkActions', () => ({
  addConditionMark: vi.fn(),
  addConditionMarkPhotos: vi.fn(),
  carryConditionMarks: (input: unknown) => carryConditionMarks(input),
  discardConditionMarkUploads: vi.fn(),
  removeConditionMark: vi.fn(),
  removeConditionMarkPhoto: vi.fn(),
  resolveConditionMark: vi.fn(),
  setVehicleBodyType: vi.fn(),
  updateConditionMark: (id: string, patch: unknown) => updateConditionMark(id, patch),
}))
// Asks the browser what kind of device this is; a desk, here.
vi.mock('@/hooks/use-native-camera', () => ({ useNativeCamera: () => false }))

import { ConditionMapCard } from '@/features/condition-map/Components/ConditionMapCard'
import { builtinMarkTypes } from '@/features/condition-map/Lib/markTypes'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'

const TYPES = builtinMarkTypes({ dent: 'Dent', scratch: 'Scratch' })

const mark = (overrides: Partial<ConditionMarkData>): ConditionMarkData => ({
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
  imageUrls: [],
  recordedAt: '2026-11-09T09:00:00.000Z',
  resolvedAt: null,
  ...overrides,
})

/** A dent drawn on this job. */
const OWN = mark({})
/** A dent from an earlier visit, still open. */
const EARLIER = mark({
  id: 'm0',
  serviceRecordId: 'old-job',
  panel: 'roof',
  recordedAt: '2026-10-01T09:00:00.000Z',
})

const renderCard = (marks: ConditionMarkData[]) =>
  render(
    <ConditionMapCard
      vehicle={{ id: 'v1', bodyType: 'sedan' }}
      scope={{ serviceRecordId: 'job1' }}
      types={TYPES}
      initialMarks={marks}
    />
  )

const legend = () => within(screen.getByRole('region', { name: 'Marks' }))
const openMark = () => fireEvent.click(legend().getByRole('button', { name: /^Mark 1: Dent/ }))
const severity = (name: 'Minor' | 'Major') => screen.getByRole('button', { name })
const note = () => screen.getByLabelText('Note')

const gate = () => {
  let open!: () => void
  const opened = new Promise<void>((resolve) => {
    open = resolve
  })
  return { opened, open }
}

describe('a change to the condition map that does not go through', () => {
  beforeEach(() => {
    updateConditionMark.mockReset()
    carryConditionMarks.mockReset()
    refresh.mockClear()
    toastError.mockClear()
  })

  it('puts the severity back and says so when the change never reaches the server', async () => {
    const answer = gate()
    updateConditionMark.mockImplementation(async () => {
      await answer.opened
      throw new TypeError('Failed to fetch')
    })
    renderCard([OWN])

    openMark()
    act(() => {
      fireEvent.click(severity('Major'))
    })
    expect(severity('Major')).toHaveAttribute('aria-pressed', 'true')

    await act(async () => answer.open())

    await waitFor(() => expect(severity('Minor')).toHaveAttribute('aria-pressed', 'true'))
    expect(updateConditionMark).toHaveBeenCalledWith('m1', { severity: 'major' })
    expect(toastError).toHaveBeenCalledWith('Could not save the mark')
  })

  it('puts the earlier marks back when Confirm all never reaches the server', async () => {
    const answer = gate()
    carryConditionMarks.mockImplementation(async () => {
      await answer.opened
      throw new TypeError('Failed to fetch')
    })
    renderCard([EARLIER])

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm all as still there' }))
    })
    expect(
      screen.queryByRole('region', { name: 'Recorded on an earlier visit' })
    ).not.toBeInTheDocument()

    await act(async () => answer.open())

    const earlier = await screen.findByRole('region', { name: 'Recorded on an earlier visit' })
    expect(within(earlier).getByRole('button', { name: /^Mark 1: Dent on the Roof/ })).toBeVisible()
    expect(legend().getByText(/^No marks yet/)).toBeInTheDocument()
    expect(toastError).toHaveBeenCalledWith('Could not save the mark')
  })

  it('leaves the mark as it was when two changes both fail, the first answering first', async () => {
    const first = gate()
    const second = gate()
    updateConditionMark
      .mockImplementationOnce(async () => {
        await first.opened
        return { success: false, error: 'Refused' }
      })
      .mockImplementationOnce(async () => {
        await second.opened
        return { success: false, error: 'Refused' }
      })
    renderCard([OWN])

    openMark()
    act(() => {
      fireEvent.click(severity('Major'))
    })
    // The note is not held while a change is out; typed and left, it saves.
    fireEvent.change(note(), { target: { value: 'Deep, down to the metal' } })
    act(() => {
      fireEvent.blur(note())
    })
    expect(updateConditionMark).toHaveBeenCalledTimes(2)

    await act(async () => first.open())
    await act(async () => second.open())

    await waitFor(() => expect(severity('Minor')).toHaveAttribute('aria-pressed', 'true'))
    expect(note()).toHaveValue('')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reads the marks back rather than undo a change that went through beside one that failed', async () => {
    const first = gate()
    updateConditionMark
      .mockImplementationOnce(async () => {
        await first.opened
        return { success: false, error: 'Refused' }
      })
      .mockImplementationOnce(async () => ({ success: true }))
    renderCard([OWN])

    openMark()
    act(() => {
      fireEvent.click(severity('Major'))
    })
    fireEvent.change(note(), { target: { value: 'Deep, down to the metal' } })
    await act(async () => {
      fireEvent.blur(note())
    })

    await act(async () => first.open())

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(note()).toHaveValue('Deep, down to the metal')
    expect(toastError).toHaveBeenCalledWith('Refused')
  })
})
