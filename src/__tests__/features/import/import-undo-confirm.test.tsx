/**
 * Undoing an import deletes the customers, vehicles and jobs it created, so
 * the question reads as a delete: a red button, and focus on Cancel so a
 * stray Enter does not remove anything.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'

const undoImportBatch = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/import/Actions/importActions', () => ({
  listImportBatches: async () => ({
    success: true,
    data: [
      {
        id: 'b1',
        entity: 'customers',
        fileName: 'customers-2026.csv',
        status: 'completed',
        createdAt: new Date('2026-11-01T10:00:00Z'),
        created: 3,
        updated: 0,
        skipped: 0,
        failed: 0,
        attached: { customers: 3, vehicles: 2, serviceRecords: 1 },
      },
    ],
  }),
  undoImportBatch: (id: string) => undoImportBatch(id),
}))

import { ImportHistoryCard } from '@/features/import/Components/ImportHistoryCard'

describe('undoing an import', () => {
  beforeEach(() => undoImportBatch.mockReset())

  it('asks like a delete and opens on Cancel', async () => {
    render(<ImportHistoryCard />, { wrapper: ConfirmProvider })
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }))

    const dialog = await screen.findByRole('alertdialog', { name: 'Undo this import?' })
    const confirm = within(dialog).getByRole('button', { name: 'Undo import' })
    expect(confirm).toHaveAttribute('data-variant', 'destructive')
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    )

    fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(undoImportBatch).not.toHaveBeenCalled()
  })
})
