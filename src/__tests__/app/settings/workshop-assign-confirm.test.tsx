/**
 * Picking a default technician offers to put them on every work order that
 * has nobody. That rewrites many jobs at once, so the question opens on
 * "No, skip": a stray Enter must not assign anyone.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'

// The picker is a popover Radix measures; jsdom has no ResizeObserver, and
// nothing here needs measuring.
// biome-ignore lint/suspicious/noEmptyBlockStatements: a stub that measures nothing
const noop = () => {}
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
)
Element.prototype.scrollIntoView = noop

const assignTechToUnassignedWorkOrders = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/settings/Actions/settingsActions', () => ({ setSettings: vi.fn() }))
vi.mock('@/features/workboard/Actions/technicianActions', () => ({
  assignTechToUnassignedWorkOrders: (id: string) => assignTechToUnassignedWorkOrders(id),
  createTechnician: vi.fn(),
}))

import { WorkshopSettings } from '@/app/(authenticated)/settings/workshop/workshop-settings'

describe('choosing a default technician', () => {
  beforeEach(() => assignTechToUnassignedWorkOrders.mockReset())

  it('asks before assigning everyone, with focus on skip', async () => {
    render(<WorkshopSettings settings={{}} technicians={[{ id: 't1', name: 'Petter' }]} />, {
      wrapper: ConfirmProvider,
    })

    // The picker shows "Search technician..." but, being a combobox, has no
    // accessible name of its own.
    const picker = screen
      .getAllByRole('combobox')
      .find((box) => box.textContent?.includes('Search technician...'))
    if (!picker) throw new Error('technician picker not found')
    fireEvent.click(picker)
    fireEvent.click(await screen.findByRole('option', { name: 'Petter' }))

    const dialog = await screen.findByRole('alertdialog', {
      name: 'Assign to existing work orders?',
    })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'No, skip' })).toHaveFocus()
    )

    fireEvent.click(within(dialog).getByRole('button', { name: 'No, skip' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(assignTechToUnassignedWorkOrders).not.toHaveBeenCalled()
  })
})
