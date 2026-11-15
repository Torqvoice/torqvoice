/**
 * The condition map without a mouse. A mark is added from the Add mark
 * button by choosing its panel, moved to another panel from its editor, and
 * nudged with the arrow keys once focused on the drawing. Marks from an
 * earlier visit stay where they are, as they do under a pointer.
 */
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const noop = () => undefined
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop
Element.prototype.hasPointerCapture = () => false
Element.prototype.releasePointerCapture = noop

const addConditionMark = vi.fn()
const updateConditionMark = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/condition-map/Actions/conditionMarkActions', () => ({
  addConditionMark: async (input: unknown) => addConditionMark(input),
  addConditionMarkPhotos: vi.fn(),
  carryConditionMarks: vi.fn(),
  discardConditionMarkUploads: vi.fn(),
  listVehicleConditionMarks: vi.fn(),
  removeConditionMark: vi.fn(),
  removeConditionMarkPhoto: vi.fn(),
  resolveConditionMark: vi.fn(),
  setVehicleBodyType: vi.fn(),
  updateConditionMark: async (id: string, patch: unknown) => updateConditionMark(id, patch),
}))
vi.mock('@/hooks/use-native-camera', () => ({ useNativeCamera: () => false }))

import { ConditionMapCard } from '@/features/condition-map/Components/ConditionMapCard'
import { getBodyDrawing } from '@/features/condition-map/Drawings'
import { builtinMarkTypes } from '@/features/condition-map/Lib/markTypes'
import type { ConditionMarkData } from '@/features/condition-map/Lib/marks'
import { panelSpots } from '@/features/condition-map/Lib/panelSpots'

const TYPES = builtinMarkTypes({ dent: 'Dent', scratch: 'Scratch' })

const mark = (over: Partial<ConditionMarkData>): ConditionMarkData => ({
  id: 'm1',
  vehicleId: 'v1',
  inspectionId: null,
  inspectionItemId: null,
  serviceRecordId: 'job1',
  bodyType: 'sedan',
  view: 'top',
  panel: 'hood',
  x: 0.2,
  y: 0.5,
  kind: 'dent',
  severity: 'minor',
  note: null,
  imageUrls: [],
  recordedAt: '2026-11-09T09:00:00.000Z',
  resolvedAt: null,
  ...over,
})

const renderCard = (marks: ConditionMarkData[] = []) =>
  render(
    <ConditionMapCard
      vehicle={{ id: 'v1', bodyType: 'sedan' }}
      scope={{ serviceRecordId: 'job1' }}
      types={TYPES}
      initialMarks={marks}
    />
  )

/** Tab forward until the element is focused, the way a keyboard user gets there. */
async function tabTo(user: ReturnType<typeof userEvent.setup>, target: () => HTMLElement) {
  for (let i = 0; i < 40; i++) {
    if (document.activeElement === target()) return
    await user.tab()
  }
  throw new Error('never reached by Tab')
}

/** In an open list, walk down with the arrow key to the option and press Enter. */
async function chooseOption(user: ReturnType<typeof userEvent.setup>, name: string) {
  for (let i = 0; i < 80; i++) {
    if (document.activeElement?.getAttribute('role') === 'option') {
      if (document.activeElement.textContent === name) {
        await user.keyboard('{Enter}')
        return
      }
    }
    await user.keyboard('{ArrowDown}')
  }
  throw new Error(`no option ${name}`)
}

// Tab and the panel list take a while under a full run.
vi.setConfig({ testTimeout: 30000 })

describe('the condition map from the keyboard', () => {
  beforeEach(() => {
    addConditionMark.mockReset()
    updateConditionMark.mockReset()
  })

  it('adds a mark on a chosen panel and moves it to another panel', async () => {
    const user = userEvent.setup({ delay: null })
    const spots = panelSpots(getBodyDrawing('sedan'))
    const bonnet = spots.find((s) => s.view === 'top' && s.panel === 'hood')
    const roof = spots.find((s) => s.view === 'top' && s.panel === 'roof')
    expect(bonnet && roof).toBeTruthy()
    addConditionMark.mockImplementation(async (input: Record<string, unknown>) => ({
      success: true,
      data: mark({ id: 'new1', ...(input as Partial<ConditionMarkData>) }),
    }))
    updateConditionMark.mockResolvedValue({ success: true })
    renderCard()

    // The view on screen decides which panels are offered.
    await tabTo(user, () => screen.getByRole('button', { name: 'Top' }))
    await user.keyboard('{Enter}')
    await tabTo(user, () => screen.getByRole('button', { name: 'Add mark' }))
    await user.keyboard('{Enter}')
    const dialog = await screen.findByRole('dialog', { name: 'Add a mark' })

    await tabTo(user, () => within(dialog).getByRole('combobox', { name: 'Panel' }))
    await user.keyboard('{Enter}')
    const options = screen.getAllByRole('option').map((o) => o.textContent)
    expect(options).toHaveLength(spots.filter((s) => s.view === 'top').length)
    expect(options).toContain('Bonnet')
    await chooseOption(user, 'Bonnet')
    expect(within(dialog).getByRole('combobox', { name: 'Panel' })).toHaveTextContent('Bonnet')

    await tabTo(user, () => within(dialog).getByRole('button', { name: 'Add mark' }))
    await act(async () => {
      await user.keyboard('{Enter}')
    })

    expect(addConditionMark).toHaveBeenCalledWith(
      expect.objectContaining({ view: 'top', panel: 'hood', x: bonnet?.x, y: bonnet?.y })
    )
    // The mark opens to be described, as after a tap.
    const editor = await screen.findByRole('dialog', { name: /Dent on the Bonnet/ })
    const panelField = within(editor).getByRole('combobox', { name: 'Panel' })
    expect(panelField).toHaveTextContent('Bonnet (Top)')

    await tabTo(user, () => within(editor).getByRole('combobox', { name: 'Panel' }))
    await user.keyboard('{Enter}')
    await act(async () => {
      await chooseOption(user, 'Roof (Top)')
    })

    expect(updateConditionMark).toHaveBeenCalledWith('new1', {
      view: 'top',
      panel: 'roof',
      x: roof?.x,
      y: roof?.y,
    })
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /Dent on the Roof/ })).toBeInTheDocument()
    )
  })

  it('nudges a focused mark with the arrow keys and saves where it stops', async () => {
    const user = userEvent.setup({ delay: null })
    updateConditionMark.mockResolvedValue({ success: true })
    renderCard([mark({})])

    const drawing = screen.getByRole('group', { name: 'Vehicle condition' })
    const onMap = within(drawing).getByRole('button', { name: 'Mark 1: Dent on the Bonnet' })
    await tabTo(user, () => onMap)
    await act(async () => {
      await user.keyboard('{ArrowRight}{ArrowRight}')
    })

    expect(updateConditionMark).toHaveBeenCalledTimes(2)
    const [id, patch] = updateConditionMark.mock.calls.at(-1) ?? []
    expect(id).toBe('m1')
    expect(patch).toMatchObject({ view: 'top', panel: 'hood' })
    // The top view stands on end on the sheet, so right on screen is along its y.
    expect(patch.y).not.toBe(0.5)
  })

  it('leaves a mark from an earlier visit where it is, and still opens it with Enter', async () => {
    const user = userEvent.setup({ delay: null })
    renderCard([mark({ serviceRecordId: 'older-job', recordedAt: '2026-01-01T09:00:00.000Z' })])

    const drawing = screen.getByRole('group', { name: 'Vehicle condition' })
    const onMap = within(drawing).getByRole('button', { name: /^Mark 1: Dent/ })
    await tabTo(user, () => onMap)
    await act(async () => {
      await user.keyboard('{ArrowRight}')
    })
    expect(updateConditionMark).not.toHaveBeenCalled()

    await user.keyboard('{Enter}')
    expect(await screen.findByRole('dialog', { name: /Dent on the Bonnet/ })).toBeInTheDocument()
  })

  it('switches between views with toggle buttons rather than tabs without panels', () => {
    renderCard()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'All views' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(screen.getByRole('button', { name: 'Top' })).toHaveAttribute('aria-pressed', 'false')
  })
})
