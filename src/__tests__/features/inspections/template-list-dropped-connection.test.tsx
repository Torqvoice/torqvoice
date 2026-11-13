/**
 * The checklist list says so when an action does not reach the server, and
 * stays on screen. An action that cannot reach the server throws instead of
 * answering; awaited inside a transition, that throw went to the error
 * boundary and the whole page was replaced by the error page.
 */
import { Component, type ReactNode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** What a dropped connection does to a server action: it throws. */
const offline = async (..._args: unknown[]) => {
  throw new TypeError('Failed to fetch')
}

const translateChecklists = vi.fn(offline)
const restoreMissingPresets = vi.fn(offline)
const deleteTemplate = vi.fn(offline)
const duplicateTemplate = vi.fn(offline)
const router = { refresh: vi.fn(), push: vi.fn() }

vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/features/inspections/Actions/templateActions', () => ({
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
  createTemplateFromPreset: vi.fn(),
  translateChecklists: (locale: string) => translateChecklists(locale),
  restoreMissingPresets: () => restoreMissingPresets(),
  deleteTemplate: (id: string) => deleteTemplate(id),
  duplicateTemplate: (id: string) => duplicateTemplate(id),
}))
vi.mock('@/features/inspections/Actions/packageActions', () => ({
  exportTemplatePackage: vi.fn(),
  importTemplatePackage: vi.fn(),
  previewTemplatePackage: vi.fn(),
}))

import { TemplateListClient } from '@/features/inspections/Components/TemplateListClient'

/** Stands in for the app's error page, so losing the page is visible. */
class ErrorPage extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? <p>Something went wrong</p> : this.props.children
  }
}

const TEMPLATE = {
  id: 't1',
  name: 'Annual service',
  description: null,
  isDefault: false,
  packageId: null,
  sections: [],
}

function renderList(props: Partial<Parameters<typeof TemplateListClient>[0]> = {}) {
  render(
    <ErrorPage>
      <TemplateListClient templates={[TEMPLATE]} checklistLanguage={null} {...props} />
    </ErrorPage>
  )
}

function expectPageStillThere() {
  expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Inspection checklists' })).toBeInTheDocument()
}

describe('checklist list on a dropped connection', () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    router.refresh.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('says the translation failed and keeps the page', async () => {
    renderList({ checklistLanguage: 'nb' })

    fireEvent.click(screen.getByRole('button', { name: 'Translate' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Could not translate the checklists')
    )
    expectPageStillThere()
    expect(screen.getByRole('button', { name: 'Translate' })).toBeEnabled()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it('says restoring the checklists failed and keeps the page', async () => {
    renderList({ templates: [] })

    fireEvent.click(screen.getByRole('button', { name: 'Restore checklists' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to add the checklists'))
    expectPageStillThere()
    expect(screen.getByRole('button', { name: 'Restore checklists' })).toBeEnabled()
  })

  it('says the delete failed and keeps the page', async () => {
    renderList()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Annual service' }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const question = await screen.findByRole('alertdialog')
    await act(async () => {
      fireEvent.click(within(question).getByRole('button', { name: 'Delete' }))
    })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to delete checklist'))
    expect(deleteTemplate).toHaveBeenCalledWith('t1')
    expectPageStillThere()
    expect(screen.getByText('Annual service')).toBeInTheDocument()
  })

  it('says the copy failed and keeps the page', async () => {
    renderList()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Actions for Annual service' }), {
      key: 'Enter',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Failed to duplicate checklist'))
    expectPageStillThere()
  })
})
