/**
 * "Work on" on a work order keeps what the job worked on: an item moved to
 * another vehicle or taken off since stays listed and marked, can be
 * unpicked, and cannot be picked again.
 */
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const actions = vi.hoisted(() => ({
  setJobEquipment: vi.fn(async (input: { itemIds: string[] }) => ({
    success: true,
    data: { itemIds: input.itemIds },
  })),
  setQuoteEquipment: vi.fn(),
}))
vi.mock('@/features/equipment/Actions/workOnActions', () => actions)
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

// Radix and cmdk measure and scroll; jsdom does neither.
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

import { WorkOnPicker } from '@/features/equipment/Components/WorkOnPicker'

const EQUIPMENT = {
  items: [
    { id: 'here', label: 'Tail lift', typeName: 'Tail lift', state: null },
    { id: 'moved', label: 'Crane, HIAB', typeName: 'Crane', state: 'moved' as const },
    { id: 'off', label: 'Hook loader', typeName: 'Hook loader', state: 'removed' as const },
  ],
  selected: ['moved'],
}

beforeEach(() => vi.clearAllMocks())

async function openPicker() {
  await act(async () => {
    fireEvent.click(screen.getByRole('combobox'))
  })
}

describe('an item moved or taken off since the job picked it', () => {
  it('is still shown as picked and marked as moved', async () => {
    render(<WorkOnPicker target={{ kind: 'job', id: 'job-1' }} equipment={EQUIPMENT} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Crane, HIAB')
    await openPicker()
    expect(screen.getByTestId('work-on-state-moved')).toHaveTextContent('Moved since')
    expect(screen.getByTestId('work-on-state-off')).toHaveTextContent('Taken off since')
  })

  it('can be unpicked', async () => {
    render(<WorkOnPicker target={{ kind: 'job', id: 'job-1' }} equipment={EQUIPMENT} />)
    await openPicker()
    await act(async () => {
      fireEvent.click(screen.getByTestId('work-on-item-moved'))
    })
    expect(actions.setJobEquipment).toHaveBeenCalledWith({ id: 'job-1', itemIds: [] })
  })

  it('cannot be picked when the job does not have it', async () => {
    render(<WorkOnPicker target={{ kind: 'job', id: 'job-1' }} equipment={EQUIPMENT} />)
    await openPicker()
    expect(screen.getByTestId('work-on-item-off')).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByTestId('work-on-item-here')).not.toHaveAttribute('aria-disabled', 'true')
  })
})
