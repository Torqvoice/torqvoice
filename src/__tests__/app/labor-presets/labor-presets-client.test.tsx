/**
 * The labor packages list says so when a delete or an edit does not go
 * through, whether the server refused it or the request never arrived.
 *
 * A server action that cannot reach the server throws instead of answering.
 * The list only read the answer, so on a weak connection Delete did nothing
 * anyone could see and people pressed it again and again.
 */
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/confirm-dialog'
import { GlassModal, useGlassModal } from '@/components/glass-modal'

const deleteLaborPreset = vi.fn()
const getLaborPreset = vi.fn()
const router = { push: vi.fn(), refresh: vi.fn() }
const searchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/labor-presets',
  useSearchParams: () => searchParams,
}))

vi.mock('@/features/labor-presets/Actions/laborPresetActions', () => ({
  deleteLaborPreset: (id: string) => deleteLaborPreset(id),
  getLaborPreset: (id: string) => getLaborPreset(id),
}))

// The form is its own screen; here it only has to show that it opened.
vi.mock('@/features/labor-presets/Components/LaborPresetForm', () => ({
  LaborPresetForm: ({ open, preset }: { open: boolean; preset?: { name: string } }) =>
    open ? <p>Editing {preset?.name}</p> : null,
}))

import { LaborPresetsClient } from '@/app/(authenticated)/labor-presets/labor-presets-client'

/** What a browser's fetch throws when the request never reached the server. */
const offline = () => new TypeError('Failed to fetch')

const PRESET = {
  id: 'p1',
  name: 'Brake service',
  description: 'Pads and discs, front axle',
  _count: { items: 2 },
  items: [
    { hours: 1.5, pricingType: 'hourly' },
    { hours: 1, pricingType: 'service' },
  ],
}

function renderList() {
  render(
    <ConfirmProvider>
      <LaborPresetsClient
        data={{ presets: [PRESET], total: 1, page: 1, pageSize: 20, totalPages: 1 }}
        search=""
        sortBy="name"
        sortOrder="asc"
      />
      <GlassModal />
    </ConfirmProvider>
  )
}

/** Opens the row's menu, picks Delete, and answers the question with Delete. */
async function deleteFromMenu() {
  fireEvent.keyDown(screen.getAllByRole('button', { name: 'Open menu' })[0], { key: 'Enter' })
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  const question = await screen.findByRole('alertdialog')
  expect(within(question).getByText(/permanently delete "Brake service"/)).toBeInTheDocument()
  await act(async () => {
    fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
  })
}

describe('labor packages list', () => {
  beforeEach(() => {
    deleteLaborPreset.mockReset()
    getLaborPreset.mockReset()
    router.push.mockClear()
    router.refresh.mockClear()
    act(() => useGlassModal.getState().close())
  })

  it('re-reads the list after a delete that went through', async () => {
    deleteLaborPreset.mockResolvedValue({ success: true })
    renderList()

    await deleteFromMenu()

    expect(deleteLaborPreset).toHaveBeenCalledWith('p1')
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Failed to delete labor package')).not.toBeInTheDocument()
  })

  it('says the delete failed when the request never reaches the server', async () => {
    deleteLaborPreset.mockRejectedValue(offline())
    renderList()

    await deleteFromMenu()

    expect(await screen.findByText('Failed to delete labor package')).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('shows what the server said when it refuses the delete', async () => {
    deleteLaborPreset.mockResolvedValue({ success: false, error: 'Preset not found' })
    renderList()

    await deleteFromMenu()

    expect(await screen.findByText('Preset not found')).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('says the package could not be loaded when opening it never reaches the server', async () => {
    getLaborPreset.mockRejectedValue(offline())
    renderList()

    await act(async () => {
      fireEvent.click(screen.getAllByText('Brake service')[0])
    })

    expect(await screen.findByText('Failed to load labor package')).toBeInTheDocument()
    expect(screen.queryByText('Editing Brake service')).not.toBeInTheDocument()
  })

  it('opens the package for editing once it has loaded', async () => {
    getLaborPreset.mockResolvedValue({
      success: true,
      data: { id: 'p1', name: 'Brake service', description: null, items: [] },
    })
    renderList()

    await act(async () => {
      fireEvent.click(screen.getAllByText('Brake service')[0])
    })

    expect(await screen.findByText('Editing Brake service')).toBeInTheDocument()
  })
})
